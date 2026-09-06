#!/usr/bin/env node

const assert = require("node:assert/strict");

(async () => {
  const {
    conversationTitleFromDocumentTitle,
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

  // Site document titles: keep the conversation title, drop the brand and placeholders.
  assert.equal(conversationTitleFromDocumentTitle("Kyoto trip - Claude"), "Kyoto trip");
  assert.equal(conversationTitleFromDocumentTitle("Gemini | Kyoto trip"), "Kyoto trip");
  assert.equal(conversationTitleFromDocumentTitle("Kyoto trip — ChatGPT"), "Kyoto trip");
  assert.equal(conversationTitleFromDocumentTitle("Kyoto trip · Kagi Assistant"), "Kyoto trip");
  assert.equal(conversationTitleFromDocumentTitle("Kyoto trip"), "Kyoto trip");
  assert.equal(conversationTitleFromDocumentTitle("the rational male 系列 - Grok"), "the rational male 系列");
  assert.equal(conversationTitleFromDocumentTitle("Grok"), "", "a bare brand is not a conversation title");
  assert.equal(conversationTitleFromDocumentTitle("ChatGPT"), "");
  assert.equal(conversationTitleFromDocumentTitle("Kagi Assistant"), "");
  assert.equal(conversationTitleFromDocumentTitle("Notion AI"), "");
  assert.equal(conversationTitleFromDocumentTitle("New chat - ChatGPT"), "", "placeholders never name a desk");
  assert.equal(conversationTitleFromDocumentTitle("新对话 | DeepSeek"), "");
  assert.equal(conversationTitleFromDocumentTitle("Just a moment..."), "");
  assert.equal(conversationTitleFromDocumentTitle("Sign in - Manus"), "");
  assert.equal(conversationTitleFromDocumentTitle(""), "");
  assert.equal(conversationTitleFromDocumentTitle("Manus"), "", "known custom brands are stripped without context");
  assert.equal(
    conversationTitleFromDocumentTitle("Weekend plan - Acme Chat", { appName: "Acme Chat", hostname: "chat.acme.ai" }),
    "Weekend plan",
    "the caller's app name is a brand token"
  );
  assert.equal(conversationTitleFromDocumentTitle("Acme", { appName: "Acme Chat" }), "", "brand suffixes such as Chat/AI/App are ignored");
  assert.equal(conversationTitleFromDocumentTitle("Weekend plan - acme", { hostname: "www.acme.io" }), "Weekend plan", "hostname labels are brand tokens");
  assert.equal(conversationTitleFromDocumentTitle("Chat", { hostname: "chat.acme.io" }), "", "generic host labels never become titles");
  assert.equal(conversationTitleFromDocumentTitle("Prompt - Claude"), "", "the ChatClub placeholder title stays generic");
  assert.equal(conversationTitleFromDocumentTitle("Grok - Ask anything about Grok"), "Ask anything about Grok", "only whole brand segments are stripped");
  assert.ok(conversationTitleFromDocumentTitle(`${"long ".repeat(30)}- Claude`).length <= 48);
  assert.equal(conversationTitleFromDocumentTitle("Untitled conversation - Claude"), "");
  assert.equal(conversationTitleFromDocumentTitle("加载中… | Kimi"), "");
  assert.equal(conversationTitleFromDocumentTitle("Plan a trip | Kimi"), "Plan a trip");

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
    const state = { options: {}, topicTitle: "the rational male 系列", topicTitleCustom: false };
    const api = createWorkspaceTopicTitleController({
      state,
      rememberWorkspaceSession() {},
      render() {},
      generateTopicTitle: async () => "Late auto title"
    });
    assert.equal(api.syncFromSnapshot({ topicTitle: "", topicTitleCustom: false }), true);
    assert.equal(state.topicTitle, "");
    assert.equal(state.topicTitleCustom, false);
    assert.equal(await api.maybeGenerateFromPrompt("a later prompt"), "Late auto title");
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

  {
    // Adopting a site-published title is final, never generated, and never overrides a custom or existing title.
    const remembered = [];
    const state = { options: {}, topicTitle: "", topicTitleCustom: false };
    const api = createWorkspaceTopicTitleController({
      state,
      rememberWorkspaceSession: () => { remembered.push(state.topicTitle); },
      render() {},
      generateTopicTitle: async () => { throw new Error("adoption must not call the title API"); }
    });
    assert.equal(api.maybeAdoptTitle("   "), "");
    assert.equal(api.maybeAdoptTitle("ChatClub"), "", "generic titles are rejected");
    assert.equal(state.topicTitle, "");
    assert.equal(api.maybeAdoptTitle("Kyoto trip"), "Kyoto trip");
    assert.equal(state.topicTitle, "Kyoto trip");
    assert.equal(state.topicTitleCustom, false);
    assert.deepEqual(remembered, ["Kyoto trip"]);
    assert.equal(api.maybeAdoptTitle("Something else"), "Kyoto trip", "an existing auto title is kept");
    api.setCustomTitle("Mine");
    assert.equal(api.maybeAdoptTitle("Kyoto trip"), "Mine", "a custom title always wins");
    assert.equal(await api.maybeGenerateFromPrompt("first prompt"), "Mine");
  }

  {
    // A late generation result is dropped when the desk it targeted moved on.
    const state = { options: {}, topicTitle: "", topicTitleCustom: false };
    let wanted = true;
    let moveOnDuringGeneration = true;
    const api = createWorkspaceTopicTitleController({
      state,
      rememberWorkspaceSession() {},
      render() {},
      generateTopicTitle: async () => {
        if (moveOnDuringGeneration) wanted = false;
        return "Stale desk title";
      }
    });
    assert.equal(await api.maybeGenerateFromPrompt("first prompt", { stillWanted: () => wanted }), "");
    assert.equal(state.topicTitle, "", "a result for a desk that moved on must not be applied");
    wanted = true;
    moveOnDuringGeneration = false;
    assert.equal(await api.maybeGenerateFromPrompt("first prompt", { stillWanted: () => wanted }), "Stale desk title");
  }

  {
    // Adoption while a generation is in flight supersedes that generation.
    const state = { options: {}, topicTitle: "", topicTitleCustom: false };
    let finishGenerate;
    const generateDone = new Promise((resolve) => { finishGenerate = resolve; });
    const api = createWorkspaceTopicTitleController({
      state,
      rememberWorkspaceSession() {},
      render() {},
      generateTopicTitle: async () => {
        await generateDone;
        return "Generated late";
      }
    });
    assert.equal(api.isGenerating(), false);
    const pending = api.maybeGenerateFromPrompt("first prompt");
    assert.equal(api.isGenerating(), true, "a composer prompt reports an in-flight generation");
    assert.equal(api.maybeAdoptTitle("Published title"), "Published title");
    finishGenerate();
    assert.equal(await pending, "Published title");
    assert.equal(api.isGenerating(), false);
    assert.equal(state.topicTitle, "Published title");
  }

  console.log("workspace topic title: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
