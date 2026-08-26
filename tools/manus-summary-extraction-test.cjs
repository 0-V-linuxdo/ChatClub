#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8").replace(/\r\n?/g, "\n");
}

function userscriptBody() {
  const source = read("userscripts/manus.js");
  const header = source.match(/^(?:\/\/[^\n]*\n)+\s*/);
  assert.ok(header && /Summary userscript/.test(header[0]), "userscripts/manus.js: missing Summary userscript header");
  const body = source.slice(header[0].length).trim();
  assert.ok(body, "userscripts/manus.js: userscript body is empty");
  return body;
}

function splitSelector(selector) {
  return String(selector || "").split(",").map((part) => part.trim()).filter(Boolean);
}

function matchesSimpleSelector(node, selector) {
  if (!node || node.nodeType !== 1) return false;
  const value = selector.trim();
  if (!value) return false;
  const idSelector = value.match(/^#([\w-]+)$/);
  if (idSelector) return node.id === idSelector[1];
  const classSelector = value.match(/^([a-z][\w-]*)?\.([\w-]+)$/i);
  if (classSelector) {
    if (classSelector[1] && node.tagName.toLowerCase() !== classSelector[1].toLowerCase()) return false;
    return String(node.getAttribute("class") || "").split(/\s+/).includes(classSelector[2]);
  }
  const attribute = value.match(/^\[([\w-]+)(?:(\*=|=)(?:"([^"]*)"|'([^']*)'|([^\]]+)))?\]$/);
  if (attribute) {
    const name = attribute[1];
    if (!node.hasAttribute(name)) return false;
    const operator = attribute[2];
    const expected = attribute[3] ?? attribute[4] ?? attribute[5];
    if (expected === undefined) return true;
    const actual = String(node.getAttribute(name) || "");
    const normalizedExpected = String(expected).trim();
    return operator === "*=" ? actual.includes(normalizedExpected) : actual === normalizedExpected;
  }
  return node.tagName.toLowerCase() === value.toLowerCase();
}

function matchesSelector(node, selector) {
  return splitSelector(selector).some((part) => matchesSimpleSelector(node, part));
}

class FakeElement {
  constructor(document, tagName, options = {}) {
    this.nodeType = 1;
    this.ownerDocument = document;
    this.tagName = String(tagName || "div").toUpperCase();
    this.parentElement = null;
    this.children = [];
    this.attributes = new Map();
    this.className = options.className || "";
    this.innerText = options.text || "";
    this.textContent = options.text || "";
    this.copyPayload = options.copyPayload || "";
    this.rect = {
      left: Number(options.rect?.left) || 0,
      top: Number(options.rect?.top) || 0,
      width: Number(options.rect?.width) || 240,
      height: Number(options.rect?.height) || 32
    };
    this.rect.right = this.rect.left + this.rect.width;
    this.rect.bottom = this.rect.top + this.rect.height;
    if (options.id) this.setAttribute("id", options.id);
    if (options.className) this.setAttribute("class", options.className);
    for (const [name, value] of Object.entries(options.attrs || {})) this.setAttribute(name, value);
  }

  get id() {
    return this.getAttribute("id") || "";
  }

  get firstElementChild() {
    return this.children[0] || null;
  }

  append(...nodes) {
    for (const node of nodes) {
      node.parentElement = this;
      node.ownerDocument = this.ownerDocument;
      this.children.push(node);
    }
    return this;
  }

  setAttribute(name, value) {
    this.attributes.set(String(name), String(value));
    if (name === "class") this.className = String(value);
  }

  getAttribute(name) {
    return this.attributes.has(String(name)) ? this.attributes.get(String(name)) : null;
  }

  hasAttribute(name) {
    return this.attributes.has(String(name));
  }

  matches(selector) {
    return matchesSelector(this, selector);
  }

  closest(selector) {
    for (let node = this; node; node = node.parentElement) {
      if (matchesSelector(node, selector)) return node;
    }
    return null;
  }

  querySelectorAll(selector) {
    const result = [];
    const visit = (node) => {
      for (const child of node.children) {
        if (matchesSelector(child, selector)) result.push(child);
        visit(child);
      }
    };
    visit(this);
    return result;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  contains(other) {
    for (let node = other; node; node = node.parentElement) if (node === this) return true;
    return false;
  }

  getBoundingClientRect() {
    return { ...this.rect };
  }

  compareDocumentPosition(other) {
    const order = this.ownerDocument.documentOrder();
    const left = order.indexOf(this);
    const right = order.indexOf(other);
    if (left < 0 || right < 0 || left === right) return 0;
    return left < right ? 4 : 2;
  }

  dispatchEvent() {
    return true;
  }

  scrollIntoView() {}
}

class FakeDocument {
  constructor() {
    this.documentElement = new FakeElement(this, "html", { id: "html", rect: { width: 1400, height: 2400 } });
    this.body = new FakeElement(this, "body", { id: "body", rect: { width: 1400, height: 2400 } });
    this.documentElement.append(this.body);
    this.title = "";
  }

  createElement(tagName, options = {}) {
    return new FakeElement(this, tagName, options);
  }

  querySelectorAll(selector) {
    const out = [];
    if (matchesSelector(this.documentElement, selector)) out.push(this.documentElement);
    if (matchesSelector(this.body, selector)) out.push(this.body);
    for (const node of this.body.querySelectorAll(selector)) if (!out.includes(node)) out.push(node);
    return out;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  getElementById(id) {
    return this.documentOrder().find((node) => node.id === id) || null;
  }

  documentOrder() {
    const out = [];
    const visit = (node) => {
      out.push(node);
      for (const child of node.children) visit(child);
    };
    visit(this.documentElement);
    return out;
  }

  dispatchEvent() {
    return true;
  }
}

function normalize(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function merge(messages) {
  const out = [];
  for (const message of messages || []) {
    const role = message?.role === "user" ? "user" : "assistant";
    const text = normalize(message?.text || message?.content || "");
    if (!text) continue;
    const previous = out[out.length - 1];
    if (previous?.role === role) previous.text = normalize(`${previous.text}\n\n${text}`);
    else out.push({ role, text });
  }
  return out;
}

function element(document, tagName, options = {}, children = []) {
  const node = document.createElement(tagName, options);
  node.append(...children);
  return node;
}

function control(document, id, label, x, y, copyPayload = "") {
  return element(document, "button", {
    id,
    attrs: { "aria-label": label, title: label },
    text: label,
    copyPayload,
    rect: { left: x, top: y, width: 32, height: 28 }
  });
}

function iconControl(document, id, icon, x, y, copyPayload = "") {
  const svg = element(document, "svg", {
    id: `${id}-icon`,
    className: `lucide-${icon}`,
    attrs: { "data-icon": icon, viewBox: "0 0 24 24" },
    rect: { left: x + 4, top: y + 4, width: 20, height: 20 }
  });
  return element(document, "button", {
    id,
    copyPayload,
    rect: { left: x, top: y, width: 32, height: 28 }
  }, [svg]);
}

function actionBar(document, id, y, controls, status = "") {
  const children = status
    ? [element(document, "span", { id: `${id}-status`, text: status, rect: { left: 80, top: y, width: 140, height: 24 } }), ...controls]
    : controls;
  return element(document, "div", {
    id,
    className: "manus-message-actions",
    text: [status, ...controls.map((item) => item.innerText)].filter(Boolean).join(" "),
    rect: { left: 80, top: y, width: 280, height: 32 }
  }, children);
}

function userTurn(document, id, y, text, options = {}) {
  const edit = control(document, `${id}-edit`, options.editLabel || "Edit", 100, y + 44);
  const copy = options.iconOnly
    ? iconControl(document, `${id}-copy`, "copy", 144, y + 44, text)
    : control(document, `${id}-copy`, options.copyLabel || "Copy", 144, y + 44, text);
  return {
    node: element(document, "div", {
      id,
      className: "manus-user-turn",
      text,
      rect: { left: 60, top: y, width: 900, height: 90 }
    }, [
      element(document, "p", { text, rect: { left: 80, top: y, width: 720, height: 36 } }),
      actionBar(document, `${id}-actions`, y + 44, [copy, edit])
    ]),
    copy,
    edit
  };
}

function assistantTurn(document, id, y, text, options = {}) {
  const children = [];
  const nestedCopies = [];
  if (options.table) {
    const tableCopy = control(document, `${id}-table-copy`, options.tableCopyLabel || "Copy table", 680, y + 40, options.tableText || "nested table");
    children.push(element(document, "table", {
      id: `${id}-table`,
      text: options.tableText || "nested table",
      rect: { left: 80, top: y, width: 640, height: 80 }
    }, [
      element(document, "caption", { text: options.tableText || "nested table" }),
      element(document, "tr", {}, [
        element(document, "td", {}, [tableCopy])
      ])
    ]));
    nestedCopies.push(tableCopy);
  }
  if (options.code) {
    const codeCopy = control(document, `${id}-code-copy`, options.codeCopyLabel || "Copy code", 680, y + 140, options.codeText || "code fragment");
    children.push(element(document, "pre", {
      id: `${id}-pre`,
      text: options.codeText || "code fragment",
      rect: { left: 80, top: y + 100, width: 640, height: 80 }
    }, [
      element(document, "code", { text: options.codeText || "code fragment" }),
      codeCopy
    ]));
    nestedCopies.push(codeCopy);
  }
  const copy = options.iconOnly
    ? iconControl(document, `${id}-copy`, "copy", 220, y + 220, text)
    : control(document, `${id}-copy`, options.copyLabel || "Copy", 220, y + 220, text);
  const retry = control(document, `${id}-retry`, options.retryLabel || "Retry", 260, y + 220);
  children.push(element(document, "div", {
    id: `${id}-answer`,
    text,
    rect: { left: 80, top: y, width: 900, height: options.table || options.code ? 200 : 120 }
  }));
  children.push(actionBar(
    document,
    `${id}-actions`,
    y + 220,
    [copy, retry],
    options.status || "Task completed"
  ));
  return {
    node: element(document, "div", {
      id,
      className: "manus-assistant-turn",
      text,
      rect: { left: 60, top: y, width: 940, height: 280 }
    }, children),
    copy,
    retry,
    nestedCopies
  };
}

async function executeRunner(buildFixture, { native } = {}) {
  const document = new FakeDocument();
  const chat = element(document, "div", {
    id: "manus-chat-box",
    rect: { left: 0, top: 0, width: 1200, height: 5000 }
  });
  document.body.append(chat);
  const fixture = buildFixture({ document, chat });
  const copied = [];
  const api = {
    normalize,
    qsa(selector, scope = document) {
      return Array.from((scope || document).querySelectorAll(selector));
    },
    qs(selector, scope = document) {
      return (scope || document).querySelector(selector);
    },
    closest(node, selector) {
      return node?.closest(selector) || null;
    },
    visible(node) {
      const rect = node?.getBoundingClientRect?.();
      return Boolean(rect?.width && rect?.height);
    },
    reveal() {},
    sleep: async () => {},
    merge,
    async copy(node) {
      copied.push(node.id);
      return node.copyPayload || "";
    }
  };
  if (typeof native === "function") api.extractNativeCopyConversation = native;
  const context = vm.createContext({
    api,
    document,
    Node: { DOCUMENT_POSITION_PRECEDING: 2, DOCUMENT_POSITION_FOLLOWING: 4 },
    getComputedStyle(node) {
      return {
        display: node?.getAttribute?.("data-display") || "block",
        visibility: node?.getAttribute?.("data-visibility") || "visible"
      };
    }
  });
  const runner = vm.runInContext(`(async function (api) {\n${userscriptBody()}\n})`, context, {
    filename: "userscripts/manus.js"
  });
  const result = await runner(api);
  return { result: JSON.parse(JSON.stringify(result)), copied, fixture };
}

(async () => {
  const prompt = "科幻作家七月的出版小说作品";
  const sent = "搜索：科幻作家 七月\n出版的小说/小说集";
  const answer = "七月出版过《荒村公寓》《看不见的城市》等长篇。参考来源不应当成独立一轮。";
  const assistantLead = "收到，我将检索科幻作家“七月”已出版的小说与小说集，并核对来源。";

  const happy = await executeRunner(({ document, chat }) => {
    const user = userTurn(document, "manus-user", 20, prompt);
    const assistant = assistantTurn(document, "manus-assistant", 140, answer, { table: true, tableText: "书名 | 年份" });
    chat.append(user.node, assistant.node);
    return { user, assistant };
  });
  assert.deepEqual(happy.result, [
    { role: "user", text: prompt },
    { role: "assistant", text: answer }
  ]);
  assert.deepEqual(happy.copied, ["manus-user-copy", "manus-assistant-copy"]);
  assert.ok(!happy.copied.includes("manus-assistant-table-copy"), "nested table Copy must not be clicked");

  const nestedCode = await executeRunner(({ document, chat }) => {
    const user = userTurn(document, "code-user", 20, prompt);
    const assistant = assistantTurn(document, "code-assistant", 140, answer, { code: true, codeText: "print('nested')" });
    chat.append(user.node, assistant.node);
    return { user, assistant };
  });
  assert.deepEqual(nestedCode.result, [
    { role: "user", text: prompt },
    { role: "assistant", text: answer }
  ]);
  assert.ok(!nestedCode.copied.includes("code-assistant-code-copy"), "nested code Copy must not be clicked");

  const ownerDedup = await executeRunner(({ document, chat }) => {
    const edit = control(document, "dup-user-edit", "Edit", 100, 64);
    const copy = control(document, "dup-user-copy", "Copy", 144, 64, prompt);
    const clone = control(document, "dup-user-copy-clone", "Copy", 188, 64, prompt);
    const userNode = element(document, "div", {
      id: "dup-user",
      rect: { left: 60, top: 20, width: 900, height: 90 }
    }, [
      element(document, "p", { text: prompt }),
      actionBar(document, "dup-user-actions", 64, [copy, clone, edit])
    ]);
    const assistant = assistantTurn(document, "dup-assistant", 140, answer);
    chat.append(userNode, assistant.node);
    return { clone };
  });
  assert.deepEqual(ownerDedup.result, [
    { role: "user", text: prompt },
    { role: "assistant", text: answer }
  ]);
  assert.deepEqual(ownerDedup.copied, ["dup-user-copy", "dup-assistant-copy"]);
  assert.ok(!ownerDedup.copied.includes("dup-user-copy-clone"), "same-row Copy clone must not be clicked");

  const chinese = await executeRunner(({ document, chat }) => {
    const user = userTurn(document, "zh-user", 20, prompt, { editLabel: "编辑", copyLabel: "复制" });
    const assistant = assistantTurn(document, "zh-assistant", 140, answer, {
      copyLabel: "复制",
      retryLabel: "重试",
      status: "任务已完成"
    });
    chat.append(user.node, assistant.node);
    return { user, assistant };
  });
  assert.deepEqual(chinese.result, [
    { role: "user", text: prompt },
    { role: "assistant", text: answer }
  ]);
  assert.deepEqual(chinese.copied, ["zh-user-copy", "zh-assistant-copy"]);

  const iconOnly = await executeRunner(({ document, chat }) => {
    const user = userTurn(document, "icon-user", 20, prompt, { iconOnly: true });
    const assistant = assistantTurn(document, "icon-assistant", 140, answer, { iconOnly: true });
    chat.append(user.node, assistant.node);
    return { user, assistant };
  });
  assert.deepEqual(iconOnly.result, [
    { role: "user", text: prompt },
    { role: "assistant", text: answer }
  ]);
  assert.deepEqual(iconOnly.copied, ["icon-user-copy", "icon-assistant-copy"]);

  const duplicates = await executeRunner(({ document, chat }) => {
    const firstUser = userTurn(document, "repeat-user-1", 20, prompt);
    const firstAssistant = assistantTurn(document, "repeat-assistant-1", 140, answer);
    const secondUser = userTurn(document, "repeat-user-2", 440, prompt);
    const secondAssistant = assistantTurn(document, "repeat-assistant-2", 560, answer);
    chat.append(firstUser.node, firstAssistant.node, secondUser.node, secondAssistant.node);
    return {};
  });
  assert.deepEqual(duplicates.result, [
    { role: "user", text: prompt },
    { role: "assistant", text: answer },
    { role: "user", text: prompt },
    { role: "assistant", text: answer }
  ]);
  assert.deepEqual(duplicates.copied, [
    "repeat-user-1-copy",
    "repeat-assistant-1-copy",
    "repeat-user-2-copy",
    "repeat-assistant-2-copy"
  ]);

  const userOnly = await executeRunner(({ document, chat }) => {
    chat.innerText = prompt;
    chat.textContent = prompt;
    const user = userTurn(document, "only-user", 20, prompt);
    chat.append(user.node);
    return { user };
  });
  assert.deepEqual(userOnly.result, [], "user-only Copy must fail closed");
  assert.deepEqual(userOnly.copied, ["only-user-copy"]);

  const assistantOnlyClosed = await executeRunner(({ document, chat }) => {
    chat.innerText = "Task completed";
    chat.textContent = "Task completed";
    const assistant = assistantTurn(document, "only-assistant", 20, answer);
    chat.append(assistant.node);
    return { assistant };
  });
  assert.deepEqual(assistantOnlyClosed.result, [], "assistant-only Copy without a user DOM prompt must fail closed");
  assert.deepEqual(assistantOnlyClosed.copied, ["only-assistant-copy"]);

  const assistantCopyDomUser = await executeRunner(({ document, chat }) => {
    chat.innerText = `${prompt}\n${answer}\nTask completed\nAsk Manus anything, no credits charged`;
    chat.textContent = chat.innerText;
    const assistant = assistantTurn(document, "fallback-assistant", 140, answer);
    chat.append(assistant.node);
    return { assistant };
  });
  assert.deepEqual(assistantCopyDomUser.result, [
    { role: "user", text: prompt },
    { role: "assistant", text: answer }
  ]);
  assert.deepEqual(assistantCopyDomUser.copied, ["fallback-assistant-copy"]);

  const blank = await executeRunner(({ chat }) => {
    chat.innerText = "Ask Manus anything, no credits charged\nNew task";
    chat.textContent = chat.innerText;
    return {};
  });
  assert.deepEqual(blank.result, [], "blank new-task page must return no conversation");
  assert.deepEqual(blank.copied, []);

  const nativeUsed = await executeRunner(({ document, chat }) => {
    const lonely = control(document, "lonely-copy", "Copy", 100, 20, "should not win");
    chat.append(element(document, "div", { id: "lonely" }, [lonely]));
    return {};
  }, {
    native: async () => ([
      { role: "user", text: prompt },
      { role: "assistant", text: answer }
    ])
  });
  assert.deepEqual(nativeUsed.result, [
    { role: "user", text: prompt },
    { role: "assistant", text: answer }
  ]);

  const bannerFallback = await executeRunner(({ document, chat }) => {
    document.title = `${prompt} - Manus`;
    chat.innerText = [
      prompt,
      "Manus 1.6 is free for a limited time",
      "What can I do for you?",
      "搜索：科幻作家 七月",
      "出版的小说/小说集",
      "This one's on Manus—no credits charged",
      assistantLead,
      answer,
      "Task completed",
      "How was this result?",
      "Ask Manus anything, no credits charged"
    ].join("\n");
    chat.textContent = chat.innerText;
    return {};
  });
  assert.equal(bannerFallback.result[0]?.role, "user");
  assert.equal(bannerFallback.result[0]?.text, sent);
  assert.notEqual(bannerFallback.result[0]?.text, prompt);
  assert.equal(bannerFallback.result[1]?.role, "assistant");
  assert.match(bannerFallback.result[1]?.text || "", /七月/);
  assert.doesNotMatch(bannerFallback.result[1]?.text || "", /is free for a limited time|no credits charged|This one's on Manus/i);
  assert.equal(bannerFallback.copied.length, 0);

  const titleIsNotUser = await executeRunner(({ document, chat }) => {
    document.title = `${prompt} - Manus`;
    chat.innerText = [
      prompt,
      "Manus 1.6 is free for a limited time",
      assistantLead,
      answer,
      "Task completed"
    ].join("\n");
    chat.textContent = chat.innerText;
    return {};
  });
  assert.deepEqual(titleIsNotUser.result, [], "session title must not be used as the user turn");

  const sentBubble = await executeRunner(({ document, chat }) => {
    document.title = `${prompt} - Manus`;
    const user = userTurn(document, "sent-user", 20, sent);
    const assistant = assistantTurn(document, "sent-assistant", 140, `${assistantLead}\n${answer}`);
    chat.append(user.node, assistant.node);
    return { user, assistant };
  });
  assert.deepEqual(sentBubble.result, [
    { role: "user", text: sent },
    { role: "assistant", text: `${assistantLead}\n${answer}` }
  ]);
  assert.notEqual(sentBubble.result[0]?.text, prompt);

  const storeTurns = await executeRunner(({ document, chat }) => {
    document.title = `${prompt} - Manus`;
    chat.innerText = `${prompt}\n${assistantLead}\n${answer}\nTask completed`;
    chat.textContent = chat.innerText;
    chat.__reactFiber$test = {
      memoizedProps: {
        store: {
          getState() {
            return {
              websocket: {
                ids: ["u1", "a1"],
                entities: {
                  u1: { type: "event", event: { id: "u1", type: "chat", sender: "user", content: sent } },
                  a1: { type: "event", event: { id: "a1", type: "chat", sender: "assistant", content: `${assistantLead}\n${answer}` } }
                }
              }
            };
          }
        }
      },
      child: null,
      sibling: null,
      stateNode: null
    };
    return {};
  });
  assert.deepEqual(storeTurns.result, [
    { role: "user", text: sent },
    { role: "assistant", text: `${assistantLead}\n${answer}` }
  ]);
  assert.notEqual(storeTurns.result[0]?.text, prompt);

  console.log("Manus Summary extraction regression checks passed.");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
