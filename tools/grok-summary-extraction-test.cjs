#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8").replace(/\r\n?/g, "\n");
}

function userscriptBody(relativePath) {
  const source = read(relativePath);
  const header = source.match(/^(?:\/\/[^\n]*\n)+\s*/);
  assert.ok(header && /Summary userscript/.test(header[0]), `${relativePath}: missing Summary userscript header`);
  const body = source.slice(header[0].length).trim();
  assert.ok(body, `${relativePath}: userscript body is empty`);
  return body;
}

function splitSelector(selector) {
  return String(selector || "").split(",").map((part) => part.trim()).filter(Boolean);
}

function matchesSimpleSelector(node, selector) {
  if (!node || node.nodeType !== 1) return false;
  const value = selector.trim();
  if (!value) return false;
  const attribute = value.match(/^\[([\w-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\]]+)))?\]$/);
  if (attribute) {
    const name = attribute[1];
    if (!node.hasAttribute(name)) return false;
    const expected = attribute[2] ?? attribute[3] ?? attribute[4];
    return expected === undefined || node.getAttribute(name) === String(expected).trim();
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
    attrs: { "aria-label": label },
    text: label,
    copyPayload,
    rect: { left: x, top: y, width: 32, height: 28 }
  });
}

function actionBar(document, id, y, controls) {
  return element(document, "div", {
    id,
    className: "message-action-bar action-buttons",
    rect: { left: 80, top: y, width: 180, height: 32 }
  }, controls);
}

function userTurn(document, id, y, text) {
  const edit = control(document, `${id}-edit`, "Edit", 100, y + 44);
  const copy = control(document, `${id}-copy`, "Copy", 144, y + 44, text);
  edit.setAttribute("data-opacity", "0");
  copy.setAttribute("data-opacity", "0");
  return {
    node: element(document, "section", {
      id,
      className: "user-turn",
      rect: { left: 60, top: y, width: 900, height: 90 }
    }, [
      element(document, "p", { text, rect: { left: 80, top: y, width: 720, height: 36 } }),
      actionBar(document, `${id}-actions`, y + 44, [edit, copy])
    ]),
    copy
  };
}

function assistantTurn(document, id, y, text, options = {}) {
  const children = [];
  const nestedCopies = [];
  if (options.codeCards) {
    const genericCopy = control(document, `${id}-code-generic`, "复制", 680, y + 78, options.codeText || "code fragment");
    const collapse = control(document, `${id}-code-collapse`, "收起", 592, y + 78);
    const wrap = control(document, `${id}-code-wrap`, "取消自动换行", 636, y + 78);
    const genericHeader = element(document, "div", {
      id: `${id}-code-generic-header`,
      rect: { left: 280, top: y + 70, width: 460, height: 36 }
    }, [collapse, wrap, genericCopy]);
    const genericPre = element(document, "pre", {
      text: options.codeText || "code fragment",
      rect: { left: 280, top: y + 106, width: 460, height: 92 }
    }, [element(document, "code", { text: options.codeText || "code fragment" })]);
    children.push(element(document, "div", {
      id: `${id}-code-generic-card`,
      rect: { left: 270, top: y + 66, width: 480, height: 140 }
    }, [genericHeader, genericPre]));
    nestedCopies.push(genericCopy);

    const explicitCopy = control(document, `${id}-code-explicit`, "Copy code", 680, y + 230, options.codeText || "code fragment");
    const explicitHeader = element(document, "div", {
      id: `${id}-code-explicit-header`,
      rect: { left: 280, top: y + 222, width: 460, height: 36 }
    }, [explicitCopy]);
    const explicitPre = element(document, "pre", {
      text: options.codeText || "code fragment",
      rect: { left: 280, top: y + 258, width: 460, height: 92 }
    }, [element(document, "code", { text: options.codeText || "code fragment" })]);
    children.push(element(document, "div", {
      id: `${id}-code-explicit-card`,
      rect: { left: 270, top: y + 218, width: 480, height: 140 }
    }, [explicitHeader, explicitPre]));
    nestedCopies.push(explicitCopy);
  }
  const copy = control(document, `${id}-copy`, "Copy", 100, y + 380, text);
  const companionLabel = options.companion || "Like";
  const companion = control(document, `${id}-companion`, companionLabel, 780, y + 380);
  children.unshift(element(document, "div", {
    id: `${id}-answer`,
    className: "assistant-answer",
    text,
    rect: { left: 80, top: y, width: 900, height: options.codeCards ? 360 : 120 }
  }));
  children.push(actionBar(document, `${id}-actions`, y + 380, [copy, companion]));
  return {
    node: element(document, "section", {
      id,
      className: "assistant-turn",
      rect: { left: 60, top: y, width: 940, height: 430 }
    }, children),
    copy,
    companion,
    nestedCopies
  };
}

function standaloneCopy(document, id, y, label = "Copy", payload = "must not be copied") {
  const copy = control(document, id, label, 600, y, payload);
  return {
    node: element(document, "div", {
      id: `${id}-container`,
      rect: { left: 580, top: y - 4, width: 80, height: 36 }
    }, [copy]),
    copy
  };
}

async function executeRunner(body, buildFixture, filename = "userscripts/grok.js") {
  const document = new FakeDocument();
  const main = element(document, "main", {
    id: "main",
    attrs: { role: "main" },
    rect: { left: 0, top: 0, width: 1200, height: 5000 }
  });
  document.body.append(main);
  const fixture = buildFixture({ document, main });
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
  class FakeEvent {
    constructor(type, init = {}) {
      this.type = type;
      Object.assign(this, init);
    }
  }
  const window = { PointerEvent: FakeEvent };
  const context = vm.createContext({
    api,
    document,
    window,
    Node: { DOCUMENT_POSITION_PRECEDING: 2, DOCUMENT_POSITION_FOLLOWING: 4 },
    MouseEvent: FakeEvent,
    KeyboardEvent: FakeEvent,
    PointerEvent: FakeEvent,
    getComputedStyle(node) {
      return {
        display: node?.getAttribute?.("data-display") || "block",
        visibility: node?.getAttribute?.("data-visibility") || "visible",
        opacity: node?.getAttribute?.("data-opacity") || "1"
      };
    }
  });
  const runner = vm.runInContext(`(async function (api) {\n${body}\n})`, context, { filename });
  const result = await runner(api);
  return { result: JSON.parse(JSON.stringify(result)), copied, fixture };
}

async function testProseAndNestedCode(body) {
  const prompt = "How can I block selected YouTube videos?";
  const code = "youtube.com##ytd-video-renderer:has(#video-title[title*=\\\"keyword\\\"])";
  const answer = `Use a custom uBlock rule:\n${code}\nThis keeps matching cards hidden.`;
  const run = await executeRunner(body, ({ document, main }) => {
    const user = userTurn(document, "prose-user", 20, prompt);
    const assistant = assistantTurn(document, "prose-assistant", 140, answer, { codeCards: true, codeText: code });
    main.append(user.node, assistant.node);
    return { user, assistant };
  });
  assert.deepEqual(run.result, [
    { role: "user", text: prompt },
    { role: "assistant", text: answer }
  ]);
  assert.deepEqual(run.copied, ["prose-user-copy", "prose-assistant-copy"]);
  for (const nested of run.fixture.assistant.nestedCopies) {
    assert.ok(!run.copied.includes(nested.id), `${nested.id} must not be clicked`);
  }
}

async function testPureCodeAssistant(body) {
  const prompt = "Return only the filter rule.";
  const code = "youtube.com##ytd-rich-item-renderer:has(a[href*=\\\"/shorts/\\\"])";
  const run = await executeRunner(body, ({ document, main }) => {
    const user = userTurn(document, "pure-user", 20, prompt);
    const assistant = assistantTurn(document, "pure-assistant", 140, code, { codeCards: true, codeText: code });
    main.append(user.node, assistant.node);
    return { user, assistant };
  });
  assert.deepEqual(run.result, [
    { role: "user", text: prompt },
    { role: "assistant", text: code }
  ]);
  assert.deepEqual(run.copied, ["pure-user-copy", "pure-assistant-copy"]);
}

async function testUnsafeBarsAreSkipped(body) {
  const prompt = "Valid prompt";
  const answer = "Valid assistant answer";
  const run = await executeRunner(body, ({ document, main }) => {
    const lonely = standaloneCopy(document, "lonely-copy", 40);
    const dislike = assistantTurn(document, "dislike", 160, "Dislike must not imply Like", { companion: "Dislike" });
    const user = userTurn(document, "safe-user", 700, prompt);
    const assistant = assistantTurn(document, "safe-assistant", 820, answer);
    main.append(lonely.node, dislike.node, user.node, assistant.node);
    return { lonely, dislike, user, assistant };
  });
  assert.deepEqual(run.result, [
    { role: "user", text: prompt },
    { role: "assistant", text: answer }
  ]);
  assert.deepEqual(run.copied, ["safe-user-copy", "safe-assistant-copy"]);
  assert.ok(!run.copied.includes(run.fixture.lonely.copy.id), "unaccompanied Copy must be skipped");
  assert.ok(!run.copied.includes(run.fixture.dislike.copy.id), "Copy + Dislike must not be treated as Copy + Like");
}

async function testRealDuplicateTurnsArePreserved(body) {
  const prompt = "Repeat this request";
  const answer = "Repeated assistant answer";
  const run = await executeRunner(body, ({ document, main }) => {
    const firstUser = userTurn(document, "duplicate-user-1", 20, prompt);
    const firstAssistant = assistantTurn(document, "duplicate-assistant-1", 140, answer);
    const secondUser = userTurn(document, "duplicate-user-2", 700, prompt);
    const secondAssistant = assistantTurn(document, "duplicate-assistant-2", 820, answer);
    main.append(firstUser.node, firstAssistant.node, secondUser.node, secondAssistant.node);
    return { firstUser, firstAssistant, secondUser, secondAssistant };
  });
  assert.deepEqual(run.result, [
    { role: "user", text: prompt },
    { role: "assistant", text: answer },
    { role: "user", text: prompt },
    { role: "assistant", text: answer }
  ]);
  assert.deepEqual(run.copied, [
    "duplicate-user-1-copy",
    "duplicate-assistant-1-copy",
    "duplicate-user-2-copy",
    "duplicate-assistant-2-copy"
  ]);
}

(async () => {
  const grokBody = userscriptBody("userscripts/grok.js");
  const mirrorBody = userscriptBody("userscripts/grok-dairoot.js");
  assert.equal(mirrorBody, grokBody, "Grok and Grok Mirror must differ only in their userscript header comments");

  await testProseAndNestedCode(grokBody);
  await testPureCodeAssistant(grokBody);
  await testUnsafeBarsAreSkipped(grokBody);
  await testRealDuplicateTurnsArePreserved(grokBody);

  console.log("Grok Summary extraction regression checks passed.");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
