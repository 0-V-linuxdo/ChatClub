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

function interactiveWrapper(document, id, child) {
  return element(document, "span", {
    id,
    attrs: { role: "button" },
    rect: child.getBoundingClientRect()
  }, [child]);
}

function actionBar(document, id, y, controls) {
  return element(document, "div", {
    id,
    className: "message-action-bar action-buttons",
    rect: { left: 80, top: y, width: 180, height: 32 }
  }, controls);
}

function userTurn(document, id, y, text, options = {}) {
  const edit = options.iconOnly
    ? iconControl(document, `${id}-edit`, "square-pen", 100, y + 44)
    : control(document, `${id}-edit`, options.editLabel || "Edit", 100, y + 44);
  const copy = options.iconOnly
    ? iconControl(document, `${id}-copy`, "copy", 144, y + 44, text)
    : control(document, `${id}-copy`, options.copyLabel || "Copy", 144, y + 44, text);
  edit.setAttribute("data-opacity", "0");
  copy.setAttribute("data-opacity", "0");
  const controls = options.wrapControls
    ? [interactiveWrapper(document, `${id}-edit-wrapper`, edit), interactiveWrapper(document, `${id}-copy-wrapper`, copy)]
    : [edit, copy];
  return {
    node: element(document, "section", {
      id,
      className: "user-turn",
      rect: { left: 60, top: y, width: 900, height: 90 }
    }, [
      element(document, "p", { text, rect: { left: 80, top: y, width: 720, height: 36 } }),
      actionBar(document, `${id}-actions`, y + 44, controls)
    ]),
    copy,
    edit
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
  const copy = options.iconOnly
    ? iconControl(document, `${id}-copy`, "copy", 100, y + 380, text)
    : control(document, `${id}-copy`, options.copyLabel || "Copy", 100, y + 380, text);
  const companionLabel = options.companion || options.likeLabel || "Like";
  const companion = options.iconOnly
    ? iconControl(document, `${id}-companion`, "thumbs-up", 780, y + 380)
    : control(document, `${id}-companion`, companionLabel, 780, y + 380);
  const actionControls = options.wrapControls
    ? [interactiveWrapper(document, `${id}-copy-wrapper`, copy), interactiveWrapper(document, `${id}-companion-wrapper`, companion)]
    : [copy, companion];
  children.unshift(element(document, "div", {
    id: `${id}-answer`,
    className: "assistant-answer",
    text,
    rect: { left: 80, top: y, width: 900, height: options.codeCards ? 360 : 120 }
  }));
  children.push(actionBar(document, `${id}-actions`, y + 380, actionControls));
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

async function testProseAndNestedCode(body, filename) {
  const prompt = "How can I block selected YouTube videos?";
  const code = "youtube.com##ytd-video-renderer:has(#video-title[title*=\\\"keyword\\\"])";
  const answer = `Use a custom uBlock rule:\n${code}\nThis keeps matching cards hidden.`;
  const run = await executeRunner(body, ({ document, main }) => {
    const user = userTurn(document, "prose-user", 20, prompt);
    const assistant = assistantTurn(document, "prose-assistant", 140, answer, { codeCards: true, codeText: code });
    main.append(user.node, assistant.node);
    return { user, assistant };
  }, filename);
  assert.deepEqual(run.result, [
    { role: "user", text: prompt },
    { role: "assistant", text: answer }
  ]);
  assert.deepEqual(run.copied, ["prose-user-copy", "prose-assistant-copy"]);
  for (const nested of run.fixture.assistant.nestedCopies) {
    assert.ok(!run.copied.includes(nested.id), `${nested.id} must not be clicked`);
  }
}

async function testPureCodeAssistant(body, filename) {
  const prompt = "Return only the filter rule.";
  const code = "youtube.com##ytd-rich-item-renderer:has(a[href*=\\\"/shorts/\\\"])";
  const run = await executeRunner(body, ({ document, main }) => {
    const user = userTurn(document, "pure-user", 20, prompt);
    const assistant = assistantTurn(document, "pure-assistant", 140, code, { codeCards: true, codeText: code });
    main.append(user.node, assistant.node);
    return { user, assistant };
  }, filename);
  assert.deepEqual(run.result, [
    { role: "user", text: prompt },
    { role: "assistant", text: code }
  ]);
  assert.deepEqual(run.copied, ["pure-user-copy", "pure-assistant-copy"]);
}

async function testUnsafeBarsAreSkipped(body, filename) {
  const prompt = "Valid prompt";
  const answer = "Valid assistant answer";
  const run = await executeRunner(body, ({ document, main }) => {
    const lonely = standaloneCopy(document, "lonely-copy", 40);
    const dislike = assistantTurn(document, "dislike", 160, "Dislike must not imply Like", { companion: "Dislike" });
    const user = userTurn(document, "safe-user", 700, prompt);
    const assistant = assistantTurn(document, "safe-assistant", 820, answer);
    main.append(lonely.node, dislike.node, user.node, assistant.node);
    return { lonely, dislike, user, assistant };
  }, filename);
  assert.deepEqual(run.result, [
    { role: "user", text: prompt },
    { role: "assistant", text: answer }
  ]);
  assert.deepEqual(run.copied, ["safe-user-copy", "safe-assistant-copy"]);
  assert.ok(!run.copied.includes(run.fixture.lonely.copy.id), "unaccompanied Copy must be skipped");
  assert.ok(!run.copied.includes(run.fixture.dislike.copy.id), "Copy + Dislike must not be treated as Copy + Like");
}

async function testRealDuplicateTurnsArePreserved(body, filename) {
  const prompt = "Repeat this request";
  const answer = "Repeated assistant answer";
  const run = await executeRunner(body, ({ document, main }) => {
    const firstUser = userTurn(document, "duplicate-user-1", 20, prompt);
    const firstAssistant = assistantTurn(document, "duplicate-assistant-1", 140, answer);
    const secondUser = userTurn(document, "duplicate-user-2", 700, prompt);
    const secondAssistant = assistantTurn(document, "duplicate-assistant-2", 820, answer);
    main.append(firstUser.node, firstAssistant.node, secondUser.node, secondAssistant.node);
    return { firstUser, firstAssistant, secondUser, secondAssistant };
  }, filename);
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

async function testChineseActionBars(body, filename) {
  const prompt = "请只返回最终答案。";
  const answer = "这是最终答案。";
  const run = await executeRunner(body, ({ document, main }) => {
    const user = userTurn(document, "chinese-user", 20, prompt, { editLabel: "编辑", copyLabel: "复制" });
    const assistant = assistantTurn(document, "chinese-assistant", 140, answer, { copyLabel: "复制", likeLabel: "点赞" });
    main.append(user.node, assistant.node);
    return { user, assistant };
  }, filename);
  assert.deepEqual(run.result, [
    { role: "user", text: prompt },
    { role: "assistant", text: answer }
  ]);
  assert.deepEqual(run.copied, ["chinese-user-copy", "chinese-assistant-copy"]);
}

async function testNestedIconOnlyControls(body, filename) {
  const prompt = "Use icon-only controls.";
  const answer = "Nested interactive wrappers still resolve to their canonical leaf controls.";
  const run = await executeRunner(body, ({ document, main }) => {
    const user = userTurn(document, "icon-user", 20, prompt, { iconOnly: true, wrapControls: true });
    const assistant = assistantTurn(document, "icon-assistant", 140, answer, { iconOnly: true, wrapControls: true });
    main.append(user.node, assistant.node);
    return { user, assistant };
  }, filename);
  assert.deepEqual(run.result, [
    { role: "user", text: prompt },
    { role: "assistant", text: answer }
  ]);
  assert.deepEqual(run.copied, ["icon-user-copy", "icon-assistant-copy"]);
}

async function testSingleRoleFailsClosed(body, filename) {
  const userOnly = await executeRunner(body, ({ document, main }) => {
    const user = userTurn(document, "only-user", 20, "There is no assistant turn.");
    main.append(user.node);
    return { user };
  }, filename);
  assert.deepEqual(userOnly.result, []);
  assert.deepEqual(userOnly.copied, ["only-user-copy"]);

  const assistantOnly = await executeRunner(body, ({ document, main }) => {
    const assistant = assistantTurn(document, "only-assistant", 20, "There is no user turn.");
    main.append(assistant.node);
    return { assistant };
  }, filename);
  assert.deepEqual(assistantOnly.result, []);
  assert.deepEqual(assistantOnly.copied, ["only-assistant-copy"]);
}

async function testResponsiveCopiesShareOwningBar(body, filename) {
  const prompt = "Use the canonical responsive Copy control.";
  const answer = "Only one Copy control per owning action bar is activated.";
  const run = await executeRunner(body, ({ document, main }) => {
    const userEdit = control(document, "responsive-user-edit", "Edit", 100, 64);
    const userCopy = control(document, "responsive-user-copy", "Copy", 144, 64, prompt);
    const userCopyClone = control(document, "responsive-user-copy-clone", "Copy", 188, 64, prompt);
    const userNode = element(document, "section", {
      id: "responsive-user",
      rect: { left: 60, top: 20, width: 900, height: 90 }
    }, [
      element(document, "p", { text: prompt, rect: { left: 80, top: 20, width: 720, height: 36 } }),
      actionBar(document, "responsive-user-actions", 64, [userEdit, userCopy, userCopyClone])
    ]);

    const assistantCopy = control(document, "responsive-assistant-copy", "Copy", 100, 540, answer);
    const assistantCopyClone = control(document, "responsive-assistant-copy-clone", "Copy", 144, 540, answer);
    const assistantLike = control(document, "responsive-assistant-like", "Like", 780, 540);
    const assistantNode = element(document, "section", {
      id: "responsive-assistant",
      rect: { left: 60, top: 160, width: 940, height: 430 }
    }, [
      element(document, "div", { text: answer, rect: { left: 80, top: 160, width: 900, height: 120 } }),
      actionBar(document, "responsive-assistant-actions", 540, [assistantCopy, assistantCopyClone, assistantLike])
    ]);
    main.append(userNode, assistantNode);
    return { userCopyClone, assistantCopyClone };
  }, filename);
  assert.deepEqual(run.result, [
    { role: "user", text: prompt },
    { role: "assistant", text: answer }
  ]);
  assert.deepEqual(run.copied, ["responsive-user-copy", "responsive-assistant-copy"]);
  assert.ok(!run.copied.includes(run.fixture.userCopyClone.id), "responsive user Copy clone in the same bar must not be clicked");
  assert.ok(!run.copied.includes(run.fixture.assistantCopyClone.id), "responsive assistant Copy clone in the same bar must not be clicked");
}

(async () => {
  const grokBody = userscriptBody("userscripts/grok.js");
  const mirrorBody = userscriptBody("userscripts/grok-dairoot.js");
  assert.equal(mirrorBody, grokBody, "Grok and Grok Mirror must differ only in their userscript header comments");

  for (const [filename, body] of [
    ["userscripts/grok.js", grokBody],
    ["userscripts/grok-dairoot.js", mirrorBody]
  ]) {
    await testProseAndNestedCode(body, filename);
    await testPureCodeAssistant(body, filename);
    await testUnsafeBarsAreSkipped(body, filename);
    await testRealDuplicateTurnsArePreserved(body, filename);
    await testChineseActionBars(body, filename);
    await testNestedIconOnlyControls(body, filename);
    await testSingleRoleFailsClosed(body, filename);
    await testResponsiveCopiesShareOwningBar(body, filename);
  }

  console.log("Grok Summary extraction regression checks passed.");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
