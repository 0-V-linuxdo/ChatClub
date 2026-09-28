#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8").replace(/\r\n?/g, "\n");

function userscriptBody(file) {
  const source = read(file);
  const header = source.match(/^(?:\/\/[^\n]*\n)+\s*/);
  assert.ok(header && /Summary userscript/.test(header[0]), `${file}: missing Summary userscript header`);
  return source.slice(header[0].length).trim();
}

// ChatGPT: turns are [data-message-author-role] nodes, each with one Copy
// button laid out right under it.
function chatgptPage(roles) {
  const turns = roles.map((role, index) => {
    const attributes = new Map([["data-message-author-role", role]]);
    return {
      id: `turn-${index}`,
      index,
      role,
      getAttribute: (name) => attributes.get(name) || null,
      contains: (other) => other === null,
      getBoundingClientRect: () => ({ left: 100, right: 700, top: index * 200, bottom: index * 200 + 120, width: 600, height: 120 })
    };
  });
  const buttons = turns.map((turn) => {
    const attributes = new Map([["aria-label", turn.role === "user" ? "Copy message" : "Copy response"]]);
    return {
      id: `copy-${turn.index}`,
      turn,
      getAttribute: (name) => attributes.get(name) || null,
      getBoundingClientRect: () => ({ left: 100, right: 132, top: turn.index * 200 + 130, bottom: turn.index * 200 + 158, width: 32, height: 28 })
    };
  });
  return { turns, buttons };
}

async function runChatgpt(roles, config) {
  const { turns, buttons } = chatgptPage(roles);
  const copied = [];
  const revealed = [];
  const api = {
    config,
    qsa: (selector) => (selector === "[data-message-author-role]" ? turns : buttons),
    closest: (node) => node,
    visible: () => true,
    reveal: (node) => { revealed.push(node.id); },
    sleep: async () => {},
    normalize: (value) => String(value || "").trim(),
    async copy(button) {
      copied.push(button.id);
      return `${button.turn.role} text ${button.turn.index}`;
    },
    merge: (messages) => messages,
    conversationIsGenerating: () => false
  };
  const runner = vm.runInContext(`(async function (api) {\n${userscriptBody("userscripts/chatgpt.js")}\n})`, vm.createContext({ document: {} }));
  const result = await runner(api);
  return { copied, revealed, result: JSON.parse(JSON.stringify(result)) };
}

(async () => {
  const roles = ["user", "assistant", "user", "assistant", "user", "assistant"];

  const full = await runChatgpt(roles, { id: "chatgpt" });
  assert.equal(full.copied.length, 6, "a user-initiated collect still Copies every turn");

  const firstSight = await runChatgpt(roles, { id: "chatgpt", idleFullText: true, idleFullTextTurns: 0 });
  assert.equal(firstSight.copied.length, 6, "idle first sight (0 turns) Copies the whole conversation");

  const tail = await runChatgpt(roles, { id: "chatgpt", idleFullText: true, idleFullTextTurns: 2 });
  assert.deepEqual(tail.copied, ["copy-4", "copy-5"], "an idle Copy touches only the changed exchange");
  assert.deepEqual(tail.revealed, ["turn-4", "turn-5"], "and only scrolls to those turns");
  assert.deepEqual(tail.result.map((message) => message.role), ["user", "assistant"]);

  const fromAssistant = await runChatgpt(roles, { id: "chatgpt", idleFullText: true, idleFullTextTurns: 3 });
  assert.deepEqual(fromAssistant.copied, ["copy-2", "copy-3", "copy-4", "copy-5"], "the slice widens back to the user turn that opened it");

  const tooMany = await runChatgpt(roles, { id: "chatgpt", idleFullText: true, idleFullTextTurns: 40 });
  assert.equal(tooMany.copied.length, 6);

  // Claude and Gemini slice their turn lists the same way; Grok, Kagi and
  // Notion widen their fixed idle window to the changed tail.
  const claude = read("userscripts/claude.js");
  assert.match(claude, /const articles = idleTailArticles\(claudeArticles\(\)\);/);
  assert.match(claude, /roleFromArticle\(articles\[start\]\) !== "user"/);
  const gemini = read("userscripts/gemini.js");
  assert.match(gemini, /const copyTurns = idleTail\(turns\);\nfor \(const turn of copyTurns\) await revealTurn\(turn, 40\);/, "Gemini must not reveal every turn in an idle pass");
  for (const [file, cap] of [["userscripts/grok.js", 8], ["userscripts/grok-dairoot.js", 8], ["userscripts/kagi.js", 24], ["userscripts/notion.js", 8]]) {
    const source = read(file);
    assert.match(source, new RegExp(`const idleCopyCount = idleTurns \\? Math\\.min\\(${cap}, Math\\.max\\(2, idleTurns\\)\\) : 2;`), `${file} idle window`);
    assert.match(source, /idleFullTextTurns/);
  }
  assert.match(read("userscripts/grok.js"), /copyActions\.slice\(-idleCopyCount\) : copyActions\.slice\(-8\)/);
  assert.match(read("userscripts/kagi.js"), /actions\.slice\(-idleCopyCount\) : actions\.slice\(0, 24\)/);
  assert.match(read("userscripts/notion.js"), /const copyLimit = idleFullText \? idleCopyCount : 8;/);
  assert.match(read("userscripts/notion.js"), /collectPromptRange/);
  assert.doesNotMatch(
    read("userscripts/notion.js"),
    /idleFullText\) \{\n  const fallback = notionDomTextFallback/,
    "idle Notion collection must not skip Copy in favor of a one-line DOM fallback"
  );

  // The idle turn count reaches the collector.
  assert.match(read("app/summary/controller.js"), /idleFullText: true, idleFullTextTurns \}/);

  // Idle runs never focus a site button and put back what they scrolled.
  const guard = await import(pathToFileURL(path.join(root, "content-src/shared/summary-collection-guard.js")).href);
  const scroller = { scrollTop: 400, scrollLeft: 0, scrollHeight: 4000, clientHeight: 800, scrollWidth: 800, clientWidth: 800, parentElement: null };
  const plain = { scrollTop: 0, scrollLeft: 0, scrollHeight: 100, clientHeight: 100, scrollWidth: 10, clientWidth: 10, parentElement: scroller };
  const pageRoot = { scrollTop: 0, scrollLeft: 0 };
  const target = { parentElement: plain, ownerDocument: { scrollingElement: pageRoot } };
  const idleRun = guard.beginSummaryCollectionRun({ runId: "idle-1", idle: true });
  assert.equal(guard.summaryCollectionIsIdle(), true);
  guard.rememberSummaryScrollAncestors(target);
  scroller.scrollTop = 2400;
  pageRoot.scrollTop = 90;
  guard.rememberSummaryScrollAncestors(target);
  guard.restoreSummaryScroll(idleRun);
  guard.endSummaryCollectionRun(idleRun);
  assert.equal(scroller.scrollTop, 400, "the conversation scroller is put back");
  assert.equal(pageRoot.scrollTop, 0);
  assert.equal(guard.summaryCollectionIsIdle(), false);

  const interrupted = guard.beginSummaryCollectionRun({ runId: "idle-2", idle: true });
  guard.rememberSummaryScrollAncestors(target);
  scroller.scrollTop = 3000;
  interrupted.abort("user-input");
  guard.restoreSummaryScroll(interrupted);
  guard.endSummaryCollectionRun(interrupted);
  assert.equal(scroller.scrollTop, 3000, "a run the user interrupted keeps the user's own scroll");

  const userRun = guard.beginSummaryCollectionRun({ runId: "summary-1" });
  guard.rememberSummaryScrollAncestors(target);
  scroller.scrollTop = 10;
  guard.restoreSummaryScroll(userRun);
  guard.endSummaryCollectionRun(userRun);
  assert.equal(scroller.scrollTop, 10, "a user-initiated Summary collect is not rewound");

  const summaryRuntime = read("content-src/shared/summary-runtime.js");
  assert.match(summaryRuntime, /if \(!summaryCollectionIsIdle\(\)\) button\.focus\?\.\(\);/);
  assert.match(summaryRuntime, /rememberSummaryScrollAncestors\(el\);\n    el\.scrollIntoView/);
  assert.match(read("content-src/capabilities/summary-runtime.js"), /finally \{\n      restoreSummaryScroll\(run\);\n      endSummaryCollectionRun\(run\);/);

  console.log("summary idle tail: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
