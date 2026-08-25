#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { pathToFileURL } = require("node:url");
const { functionSource } = require("./function-source.cjs");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const load = (file) => import(`${pathToFileURL(path.join(root, file)).href}?test=${Date.now()}-${Math.random()}`);

(async () => {
  const frameCommands = await load("shared/frame-commands.js");
  const constants = await load("shared/constants.js");
  const workspaceFrameController = read("app/workspace/frame-controller.js");
  const sendRuntime = read("content-src/capabilities/send-runtime.js");
  const cookieBridge = read("content-src/grok-cookie-bridge.js");
  const preload = read("content-src/preload.js");

  assert.deepEqual(frameCommands.CONTENT_BUNDLES.grokCookie.hosts, ["grok.com", "gk.dairoot.cn", "manus.im"]);
  assert.deepEqual(frameCommands.CONTENT_BUNDLES.grokCookie.requiredHosts, ["grok.com", "gk.dairoot.cn"]);
  assert.deepEqual(
    frameCommands.contentInjectionPlan({ frameUrl: "https://gk.dairoot.cn/chat/1", features: ["send"] })
      .map(({ file }) => file),
    ["content/preload.js", "content/grok-cookie-bridge.js", "content/content.js", "content/send.js"]
  );
  assert.deepEqual(
    frameCommands.contentInjectionPlan({ frameUrl: "https://manus.im/app", features: ["send"] })
      .map(({ file }) => file),
    ["content/preload.js", "content/grok-cookie-bridge.js", "content/content.js", "content/send.js"]
  );
  assert.deepEqual(
    frameCommands.contentInjectionPlan({ frameUrl: "https://fake-gk.dairoot.cn/chat/1", features: ["send"] })
      .map(({ file }) => file),
    ["content/preload.js", "content/content.js", "content/send.js"]
  );

  const preflightContext = vm.createContext({ URL, String });
  vm.runInContext(`
    ${functionSource(workspaceFrameController, "grokCookieBridgeUrl")}
    globalThis.matchesPreflight = grokCookieBridgeUrl;
  `, preflightContext);
  for (const url of [
    "https://grok.com/",
    "https://gk.dairoot.cn/",
    "https://gk.dairoot.cn/chat/1",
    "https://manus.im/",
    "https://manus.im/app"
  ]) {
    assert.equal(preflightContext.matchesPreflight(url), true, `${url} must receive the Cookie preflight`);
  }
  for (const url of [
    "http://gk.dairoot.cn/",
    "https://sub.gk.dairoot.cn/",
    "https://gk.dairoot.cn.example/",
    "http://manus.im/",
    "https://sub.manus.im/",
    "https://manus.im.example/",
    "not a url"
  ]) {
    assert.equal(preflightContext.matchesPreflight(url), false, `${url} must not receive the Cookie preflight`);
  }

  function sendTargetContext(hostname) {
    const context = vm.createContext({
      location: { hostname },
      String
    });
    vm.runInContext(`
      ${functionSource(sendRuntime, "grokHost")}
      ${functionSource(sendRuntime, "isGrokSendTarget")}
      globalThis.isTarget = isGrokSendTarget;
    `, context);
    return context;
  }

  assert.equal(sendTargetContext("unrelated.example").isTarget({ appId: "GrokMirror" }), true);
  assert.equal(sendTargetContext("unrelated.example").isTarget({ appName: "Grok Mirror" }), true);
  assert.equal(sendTargetContext("gk.dairoot.cn").isTarget({}), true);
  assert.equal(sendTargetContext("sub.gk.dairoot.cn").isTarget({}), true);
  assert.equal(sendTargetContext("gk.dairoot.cn.example").isTarget({}), false);
  assert.equal(sendTargetContext("unrelated.example").isTarget({ appId: "Other" }), false);

  const mirror = constants.BUILTIN_CHAT_APPS.find(({ id }) => id === "GrokMirror");
  assert.ok(mirror, "the built-in Grok Mirror app must exist");
  assert.equal(mirror.noSandbox, undefined, "Mirror must retain the default iframe sandbox");
  assert.equal(mirror.imagePasteStrategy, constants.PROMPT_IMAGE_PASTE_STRATEGY_BATCH);
  assert.match(mirror.sendButtonSelector, /Submit/);
  assert.match(mirror.sendButtonSelector, /提交/);

  assert.match(cookieBridge, /new Set\(\["grok\.com", "gk\.dairoot\.cn", "manus\.im"\]\)/);
  assert.match(preload, /host === "gk\.dairoot\.cn"/);
  assert.doesNotMatch(preload, /host\.endsWith\("\.gk\.dairoot\.cn"\)/);

  console.log("Grok Mirror integration checks passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
