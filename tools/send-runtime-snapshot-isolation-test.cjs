#!/usr/bin/env node

const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");

class FakeEvent {
  constructor(type, init = {}) {
    this.type = type;
    Object.assign(this, init);
  }
}

class FakeInputEvent extends FakeEvent {}
class FakeKeyboardEvent extends FakeEvent {}
class FakeMouseEvent extends FakeEvent {}

class FakeInput {
  get value() {
    return this._value || "";
  }

  set value(next) {
    this._value = String(next || "");
  }
}

class FakeTextArea extends FakeInput {
  constructor(scope, value = "") {
    super();
    this.scope = scope;
    this.value = value;
  }

  closest(selector) {
    return selector === "form" ? this.scope : null;
  }

  dispatchEvent(event) {
    if (event?.type === "paste") {
      const files = Array.from(event.clipboardData?.files || []);
      this.scope.acceptPastedFiles(files);
      const pastedText = event.clipboardData?.getData?.("text/plain") || "";
      if (pastedText) this.value = pastedText;
    }
    return true;
  }

  focus() {}
  getBoundingClientRect() {
    return { left: 10, right: 610, top: 500, bottom: 550, width: 600, height: 50 };
  }
  setSelectionRange() {}
}

class FakeFile {
  constructor(parts, name, options = {}) {
    this.parts = parts;
    this.name = name;
    this.type = options.type || "";
    this.lastModified = options.lastModified || 0;
  }
}

class FakeDataTransfer {
  constructor() {
    this.files = [];
    this.data = new Map();
    this.items = { add: (file) => this.files.push(file) };
  }

  getData(type) {
    return this.data.get(type) || "";
  }

  setData(type, value) {
    this.data.set(type, String(value));
  }
}

function attachmentNode(name) {
  return {
    tagName: "IMG",
    getAttribute(attribute) {
      if (attribute === "src") return `blob:${name}`;
      if (attribute === "aria-label") return "attachment";
      return "";
    },
    getBoundingClientRect() {
      return { left: 20, right: 100, top: 430, bottom: 490, width: 80, height: 60 };
    }
  };
}

function createScope(initialAttachments = [], { idleUploadControl = false, dropFirstPaste = false } = {}) {
  const scope = {
    attachments: initialAttachments.map(attachmentNode),
    pasteAttempts: 0,
    addAttachment(name) {
      this.attachments.push(attachmentNode(name));
    },
    acceptPastedFiles(files) {
      this.pasteAttempts += 1;
      if (dropFirstPaste && this.pasteAttempts === 1) return;
      for (const file of files) this.addAttachment(file.name);
    },
    querySelectorAll(selector) {
      if (/aria-busy|progressbar|mat-progress|uploading|loading/i.test(selector)) return [];
      if (selector === "button,[role='button']" || selector.startsWith("button[")) {
        return [
          ...(this.attachments.length ? [this.removeButton] : []),
          ...(idleUploadControl ? [this.uploadButton] : [])
        ];
      }
      if (/img\[src\^='blob:'\]/.test(selector)) return [...this.attachments];
      return [];
    }
  };
  scope.removeButton = {
    tagName: "BUTTON",
    click() {
      scope.attachments = [];
    },
    getAttribute(attribute) {
      return attribute === "aria-label" ? "Remove attachment" : "";
    },
    getBoundingClientRect() {
      return { left: 90, right: 110, top: 430, bottom: 450, width: 20, height: 20 };
    }
  };
  scope.uploadButton = {
    tagName: "BUTTON",
    click() {},
    getAttribute(attribute) {
      if (attribute === "aria-label") return "Upload file";
      if (attribute === "data-testid") return "file-upload";
      return "";
    },
    getBoundingClientRect() {
      return { left: 10, right: 40, top: 510, bottom: 540, width: 30, height: 30 };
    }
  };
  return scope;
}

async function runCase(createSendCapability, {
  id,
  residualText,
  residualAttachments,
  idleUploadControl = false,
  dropFirstPaste = false,
  payload
}) {
  const scope = createScope(residualAttachments, { idleUploadControl, dropFirstPaste });
  const input = new FakeTextArea(scope, residualText);
  const submissions = [];
  const sendButton = {
    click() {
      submissions.push({
        text: input.value,
        attachments: scope.attachments.map((node) => String(node.getAttribute("src")).replace(/^blob:/, ""))
      });
    },
    focus() {},
    scrollIntoView() {},
    matches(selector) {
      return selector === "button[data-testid='send-button']" || selector === "button[type='submit']";
    },
    getAttribute(attribute) {
      if (attribute === "aria-label") return "Send";
      if (attribute === "data-testid") return "send-button";
      if (attribute === "type") return "submit";
      return "";
    },
    getBoundingClientRect() {
      return { left: 620, right: 660, top: 505, bottom: 545, width: 40, height: 40 };
    }
  };
  globalThis.document = {
    activeElement: input,
    body: scope,
    documentElement: scope,
    execCommand() { return true; }
  };
  globalThis.location = { hostname: "chatgpt.com", href: "https://chatgpt.com/" };
  globalThis.window = {};
  let now = 1_000_000;
  const realDateNow = Date.now;
  const realSetTimeout = globalThis.setTimeout;
  Date.now = () => now;
  globalThis.setTimeout = () => 0;
  try {
    const qsa = (selector, targetRoot) => {
      if (targetRoot === scope) return scope.querySelectorAll(selector);
      if (selector === "#composer" || selector === "textarea") return [input];
      if (selector === "#send" || /button\[data-testid='send-button'\]/.test(selector)) return [sendButton];
      return [];
    };
    const normalize = (value) => String(value || "").replace(/\s+/g, " ").trim();
    const capability = createSendCapability({
      qsa,
      visible: () => true,
      normalize,
      isDisabledElement: () => false,
      sleep: async (ms) => { now += Math.max(1, Number(ms) || 1); },
      PROMPT_IMAGE_PASTE_STRATEGY_BATCH: "batch",
      buttonText: (button) => button === scope.removeButton
        ? "Remove attachment"
        : button === scope.uploadButton ? "Upload file" : "Send",
      text: (target) => target.value,
      NOTION_SEND_PROMPT_SOURCE: "chatclub:notion-send-prompt:test",
      NOTION_SEND_PROMPT_EVENT: "chatclub-notion-send-prompt-test",
      NOTION_SEND_TEXT_SOURCE: "chatclub:notion-send-text:test",
      NOTION_SEND_TEXT_EVENT: "chatclub-notion-send-text-test",
      contentBridgeIsCurrent: () => true,
      markSubmissionNavigation: () => null
    });
    const result = await capability.sendText({
      sendId: id,
      deadlineAt: now + 60_000,
      appId: "ChatGPT",
      appName: "ChatGPT",
      inputSelector: "#composer",
      sendButtonSelector: "#send",
      imageRetryCount: 0,
      ...payload
    });
    assert.equal(result.sent, true);
    assert.equal(result.deliveryState, "sent");
    assert.equal(submissions.length, 1, "each task must activate submit once");
    return submissions[0];
  } finally {
    Date.now = realDateNow;
    globalThis.setTimeout = realSetTimeout;
  }
}

(async () => {
  globalThis.Event = FakeEvent;
  globalThis.InputEvent = FakeInputEvent;
  globalThis.KeyboardEvent = FakeKeyboardEvent;
  globalThis.MouseEvent = FakeMouseEvent;
  globalThis.ClipboardEvent = FakeEvent;
  globalThis.HTMLInputElement = FakeInput;
  globalThis.HTMLTextAreaElement = FakeTextArea;
  globalThis.File = FakeFile;
  globalThis.DataTransfer = FakeDataTransfer;

  const { createSendCapability } = await import(pathToFileURL(
    path.join(root, "content-src/capabilities/send-runtime.js")
  ).href);

  const textOnly = await runCase(createSendCapability, {
    id: "snapshot-text-only",
    residualText: "S1 residual text",
    residualAttachments: ["s1-residual.png"],
    payload: { text: "S2 exact text", images: [] }
  });
  assert.deepEqual(textOnly, {
    text: "S2 exact text",
    attachments: []
  }, "a text-only task must not inherit text or attachments from an earlier failed task");

  const imageOnly = await runCase(createSendCapability, {
    id: "snapshot-image-only",
    residualText: "S1 residual text",
    residualAttachments: ["s1-residual.png"],
    payload: {
      text: "",
      images: [{
        name: "s2-only.png",
        type: "image/png",
        lastModified: 1,
        dataUrl: "data:image/png;base64,QQ=="
      }]
    }
  });
  assert.deepEqual(imageOnly, {
    text: "",
    attachments: ["s2-only.png"]
  }, "an image-only task must start from an empty composer and attach only its frozen snapshot");

  const idleUpload = await runCase(createSendCapability, {
    id: "snapshot-idle-upload-control",
    residualText: "",
    residualAttachments: [],
    idleUploadControl: true,
    payload: { text: "send despite idle upload control", images: [] }
  });
  assert.deepEqual(idleUpload, {
    text: "send despite idle upload control",
    attachments: []
  }, "a permanent upload control must not be mistaken for a queued attachment");

  const retryWithIdleUpload = await runCase(createSendCapability, {
    id: "snapshot-retry-idle-upload-control",
    residualText: "",
    residualAttachments: [],
    idleUploadControl: true,
    dropFirstPaste: true,
    payload: {
      text: "",
      imageRetryCount: 1,
      images: [{
        name: "retry-only.png",
        type: "image/png",
        lastModified: 2,
        dataUrl: "data:image/png;base64,Qg=="
      }]
    }
  });
  assert.deepEqual(retryWithIdleUpload, {
    text: "",
    attachments: ["retry-only.png"]
  }, "a permanent upload control must not block attachment cleanup before a bounded retry");

  console.log("send runtime snapshot isolation: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
