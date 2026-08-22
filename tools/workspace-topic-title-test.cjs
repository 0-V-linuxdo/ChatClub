#!/usr/bin/env node

const assert = require("node:assert/strict");

(async () => {
  const {
    sanitizeTopicTitle,
    topicTitleFromPrompt
  } = await import("../shared/topic-title.js");
  const { generateTopicTitle } = await import("../shared/api.js");
  const { createWorkspaceTopicTitleController } = await import("../app/workspace/topic-title-controller.js");

  assert.equal(sanitizeTopicTitle('  "Compare Grok and Claude"  '), "Compare Grok and Claude");
  assert.equal(sanitizeTopicTitle("```\nPrompt\n```"), "");
  assert.equal(sanitizeTopicTitle("ChatClub"), "");
  assert.equal(topicTitleFromPrompt("   Help me plan a weekend in Kyoto   "), "Help me plan a weekend in Kyoto");
  assert.ok(sanitizeTopicTitle("A".repeat(80)).length <= 48);

  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("network must not be used without an API key");
  };
  await assert.rejects(
    () => generateTopicTitle({
      apiProfiles: [{ id: "default-openai", endpoint: "https://api.openai.com/v1/chat/completions", apiKey: "", model: "gpt" }],
      topicTitleApiProfileId: "default-openai"
    }, "Plan a weekend in Kyoto"),
    /API key is not configured/
  );

  let fetchBody = null;
  globalThis.fetch = async (_url, options) => {
    fetchBody = JSON.parse(options.body);
    return {
      ok: true,
      async json() {
        return { choices: [{ message: { content: '"Kyoto weekend plan"' } }] };
      }
    };
  };
  assert.equal(await generateTopicTitle({
    apiProfiles: [{
      id: "default-openai",
      endpoint: "https://api.openai.com/v1/chat/completions",
      apiKey: "test-key",
      model: "gpt"
    }],
    topicTitleApiProfileId: "default-openai"
  }, "Help me plan a weekend in Kyoto"), "Kyoto weekend plan");
  assert.equal(fetchBody.messages[1].content, "Help me plan a weekend in Kyoto");
  globalThis.fetch = previousFetch;

  {
    const remembered = [];
    let renders = 0;
    const state = { options: {}, topicTitle: "", topicTitleCustom: false };
    const generateCalls = [];
    const api = createWorkspaceTopicTitleController({
      state,
      rememberWorkspaceSession: () => { remembered.push(state.topicTitle); },
      render: () => { renders += 1; },
      generateTopicTitle: async (_options, prompt) => {
        generateCalls.push(prompt);
        return "Kyoto weekend plan";
      }
    });
    assert.equal(api.canAutoGenerate(), true);
    assert.equal(await api.maybeGenerateFromPrompt("Help me plan a weekend in Kyoto"), "Kyoto weekend plan");
    assert.equal(state.topicTitle, "Kyoto weekend plan");
    assert.equal(state.topicTitleCustom, false);
    assert.equal(await api.maybeGenerateFromPrompt("A later message"), "Kyoto weekend plan");
    assert.deepEqual(generateCalls, ["Help me plan a weekend in Kyoto"]);
    assert.equal(remembered.at(-1), "Kyoto weekend plan");
    assert.ok(renders >= 1);
  }

  {
    const state = { options: {}, topicTitle: "", topicTitleCustom: false };
    let generateStarted;
    const started = new Promise((resolve) => { generateStarted = resolve; });
    let finishGenerate;
    const generateDone = new Promise((resolve) => { finishGenerate = resolve; });
    const api = createWorkspaceTopicTitleController({
      state,
      rememberWorkspaceSession() {},
      render() {},
      generateTopicTitle: async () => {
        generateStarted();
        await generateDone;
        return "Late auto title";
      }
    });
    const pending = api.maybeGenerateFromPrompt("first prompt");
    await started;
    api.setCustomTitle("User title");
    finishGenerate();
    assert.equal(await pending, "User title");
    assert.equal(state.topicTitle, "User title");
    assert.equal(state.topicTitleCustom, true);
  }

  {
    const state = { options: {}, topicTitle: "", topicTitleCustom: false };
    const api = createWorkspaceTopicTitleController({
      state,
      rememberWorkspaceSession() {},
      render() {},
      generateTopicTitle: async () => { throw new Error("API request failed"); }
    });
    assert.equal(await api.maybeGenerateFromPrompt("Help me plan a weekend in Kyoto"), "Help me plan a weekend in Kyoto");
    assert.equal(state.topicTitle, "Help me plan a weekend in Kyoto");
    assert.equal(state.topicTitleCustom, false);
  }

  console.log("workspace topic title: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
