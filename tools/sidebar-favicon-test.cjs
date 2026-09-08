#!/usr/bin/env node

const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");

class FakeNode {
  constructor(tagName = "") {
    this.tagName = tagName;
    this.children = [];
    this.attributes = Object.create(null);
    this.dataset = Object.create(null);
    this.className = "";
    this.hidden = false;
    this.src = "";
    this.listeners = Object.create(null);
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === "src") this.src = String(value);
    if (name === "class") this.className = String(value);
  }

  addEventListener(name, listener) {
    const key = String(name || "");
    if (!this.listeners[key]) this.listeners[key] = [];
    this.listeners[key].push(listener);
  }

  append(...children) {
    for (const child of children) {
      if (child == null || child === false) continue;
      this.children.push(child);
    }
  }
}

const previous = { document: globalThis.document, Node: globalThis.Node };
globalThis.Node = FakeNode;
globalThis.document = {
  createElement: (tagName) => new FakeNode(tagName),
  createElementNS: (_ns, tagName) => new FakeNode(tagName),
  createTextNode: (text) => Object.assign(new FakeNode("#text"), { textContent: String(text) })
};

(async () => {
  const {
    uniqueChatFaviconSources,
    renderChatFavicon,
    renderChatFaviconStack
  } = await import(pathToFileURL(path.join(root, "ui/favicon.js")).href);

  const sources = uniqueChatFaviconSources([
    { appId: "ChatGPT", href: "https://chatgpt.com/c/1" },
    { appId: "ChatGPT", href: "https://chatgpt.com/c/2" },
    { appId: "Claude", href: "https://claude.ai/chat/1" }
  ]);
  assert.deepEqual(sources.map((item) => item.appId), ["ChatGPT", "Claude"]);

  const stack = renderChatFaviconStack(
    [
      { href: "https://chatgpt.com/", app: { id: "ChatGPT", url: "https://chatgpt.com/" }, title: "ChatGPT" },
      ...sources
    ],
    {
      appFaviconUrl: (app) => `${app.url}favicon.ico`,
      effectiveFaviconUrl: (href, logoUrl) => logoUrl || href,
      fallbackFaviconUrl: () => "data:fallback"
    }
  );
  assert.match(String(stack.className), /chat-favicon-stack/);
  assert.equal(stack.children.filter((child) => child.tagName === "img").length, 3);
  assert.equal(stack.children[0].src, "https://chatgpt.com/favicon.ico");
  assert.equal(stack.children[0].attributes.title, "ChatGPT");

  const untitled = renderChatFaviconStack(
    [{ href: "https://chatgpt.com/", title: "ChatGPT" }],
    { effectiveFaviconUrl: (href) => href, omitTitle: true }
  );
  assert.equal(untitled.children[0].attributes.title, "");

  const auto = renderChatFavicon(
    { href: "https://chatgpt.com/", title: "ChatGPT" },
    { omitTitle: true }
  );
  assert.match(auto.src, /icons\.duckduckgo\.com\/ip3\/chatgpt\.com\.ico$/);
  assert.equal(auto.dataset.faviconReady, undefined);
  auto.listeners.load[0]({ currentTarget: auto });
  assert.equal(auto.dataset.faviconReady, "1");
  auto.listeners.error[0]({ currentTarget: auto });
  assert.match(auto.src, /google\.com\/s2\/favicons/);

  const api = renderChatFavicon(
    { href: "https://api.0-0.pro/v1/chat/completions" },
    { omitTitle: true }
  );
  assert.match(api.src, /icons\.duckduckgo\.com\/ip3\/api\.0-0\.pro\.ico$/);
  api.listeners.error[0]({ currentTarget: api });
  assert.match(api.src, /google\.com\/s2\/favicons\?domain=api\.0-0\.pro/);
  api.listeners.error[0]({ currentTarget: api });
  assert.match(api.src, /icons\.duckduckgo\.com\/ip3\/0-0\.pro\.ico$/);
  api.listeners.error[0]({ currentTarget: api });
  assert.match(api.src, /google\.com\/s2\/favicons\?domain=0-0\.pro/);

  const hiddenMiss = renderChatFavicon(
    { href: "https://example.com/" },
    { omitTitle: true, networkFaviconUrls: () => ["https://fail.example/icon.png"] }
  );
  hiddenMiss.listeners.error[0]({ currentTarget: hiddenMiss });
  assert.equal(hiddenMiss.hidden, true);

  const kept = renderChatFavicon(
    { href: "https://example.com/" },
    {
      omitTitle: true,
      keepVisibleOnMiss: true,
      networkFaviconUrls: () => ["https://fail.example/icon.png"]
    }
  );
  kept.listeners.error[0]({ currentTarget: kept });
  assert.equal(kept.hidden, false);
  assert.equal(kept.dataset.faviconMiss, "1");
  assert.equal(kept.dataset.faviconReady, undefined);
  assert.match(String(kept.className), /settings-site-icon-empty/);

  console.log("sidebar favicons: ok");
})().then(() => {
  if (previous.Node === undefined) delete globalThis.Node;
  else globalThis.Node = previous.Node;
  if (previous.document === undefined) delete globalThis.document;
  else globalThis.document = previous.document;
}).catch((error) => {
  if (previous.Node === undefined) delete globalThis.Node;
  else globalThis.Node = previous.Node;
  if (previous.document === undefined) delete globalThis.document;
  else globalThis.document = previous.document;
  console.error(error?.stack || error);
  process.exitCode = 1;
});
