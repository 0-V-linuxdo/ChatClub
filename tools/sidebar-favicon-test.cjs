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
  assert.match(auto.src, /^https:\/\/chatgpt\.com\/favicon\.svg$/);
  assert.equal(auto.dataset.faviconReady, undefined);
  auto.listeners.load[0]({ currentTarget: auto });
  assert.equal(auto.dataset.faviconReady, "1");
  auto.listeners.error[0]({ currentTarget: auto });
  assert.match(auto.src, /^https:\/\/chatgpt\.com\/favicon\.ico$/);
  auto.listeners.error[0]({ currentTarget: auto });
  assert.match(auto.src, /google\.com\/s2\/favicons\?domain=chatgpt\.com/);
  auto.listeners.error[0]({ currentTarget: auto });
  assert.match(auto.src, /icons\.duckduckgo\.com\/ip3\/chatgpt\.com\.ico$/);

  const api = renderChatFavicon(
    { href: "https://api.0-0.pro/v1/chat/completions" },
    { omitTitle: true }
  );
  assert.match(api.src, /^https:\/\/api\.0-0\.pro\/favicon\.svg$/);
  api.listeners.error[0]({ currentTarget: api });
  assert.match(api.src, /^https:\/\/api\.0-0\.pro\/favicon\.ico$/);
  api.listeners.error[0]({ currentTarget: api });
  assert.match(api.src, /^https:\/\/0-0\.pro\/favicon\.svg$/);
  api.listeners.error[0]({ currentTarget: api });
  assert.match(api.src, /^https:\/\/0-0\.pro\/favicon\.ico$/);
  api.listeners.error[0]({ currentTarget: api });
  assert.match(api.src, /google\.com\/s2\/favicons\?domain=api\.0-0\.pro/);
  api.listeners.error[0]({ currentTarget: api });
  assert.match(api.src, /icons\.duckduckgo\.com\/ip3\/api\.0-0\.pro\.ico$/);
  api.listeners.error[0]({ currentTarget: api });
  assert.match(api.src, /google\.com\/s2\/favicons\?domain=0-0\.pro/);
  api.listeners.error[0]({ currentTarget: api });
  assert.match(api.src, /icons\.duckduckgo\.com\/ip3\/0-0\.pro\.ico$/);

  const deepseek = renderChatFavicon(
    { href: "https://chat.deepseek.com/" },
    { omitTitle: true }
  );
  assert.match(deepseek.src, /^https:\/\/chat\.deepseek\.com\/favicon\.svg$/);
  deepseek.listeners.error[0]({ currentTarget: deepseek });
  assert.match(deepseek.src, /^https:\/\/chat\.deepseek\.com\/favicon\.ico$/);
  deepseek.listeners.error[0]({ currentTarget: deepseek });
  assert.match(deepseek.src, /^https:\/\/deepseek\.com\/favicon\.svg$/);

  const ddgDefault = renderChatFavicon(
    { href: "https://gk.dairoot.cn/" },
    {
      omitTitle: true,
      siteFaviconUrls: () => [],
      networkFaviconUrls: () => [
        "https://icons.duckduckgo.com/ip3/gk.dairoot.cn.ico",
        "https://www.google.com/s2/favicons?domain=gk.dairoot.cn&sz=64"
      ]
    }
  );
  assert.match(ddgDefault.src, /icons\.duckduckgo\.com\/ip3\/gk\.dairoot\.cn\.ico$/);
  ddgDefault.naturalWidth = 48;
  ddgDefault.naturalHeight = 48;
  ddgDefault.listeners.load[0]({ currentTarget: ddgDefault });
  assert.notEqual(ddgDefault.dataset.faviconReady, "1");
  assert.match(ddgDefault.src, /google\.com\/s2\/favicons\?domain=gk\.dairoot\.cn/);

  const googleGeneric = renderChatFavicon(
    { href: "https://example.test/" },
    {
      omitTitle: true,
      siteFaviconUrls: () => [],
      networkFaviconUrls: () => ["https://www.google.com/s2/favicons?domain=example.test&sz=64"]
    }
  );
  googleGeneric.naturalWidth = 16;
  googleGeneric.naturalHeight = 16;
  googleGeneric.listeners.load[0]({ currentTarget: googleGeneric });
  assert.notEqual(googleGeneric.dataset.faviconReady, "1");
  assert.equal(googleGeneric.hidden, true);

  const pixel = renderChatFavicon(
    { href: "https://example.test/pixel" },
    {
      omitTitle: true,
      siteFaviconUrls: () => [],
      networkFaviconUrls: () => [
        "https://cdn.example.test/spacer.gif",
        "https://cdn.example.test/real.png"
      ]
    }
  );
  pixel.naturalWidth = 1;
  pixel.naturalHeight = 1;
  pixel.listeners.load[0]({ currentTarget: pixel });
  assert.notEqual(pixel.dataset.faviconReady, "1");
  assert.equal(pixel.src, "https://cdn.example.test/real.png");

  const hiddenMiss = renderChatFavicon(
    { href: "https://example.com/" },
    {
      omitTitle: true,
      siteFaviconUrls: () => [],
      networkFaviconUrls: () => ["https://fail.example/icon.png"]
    }
  );
  hiddenMiss.listeners.error[0]({ currentTarget: hiddenMiss });
  assert.equal(hiddenMiss.hidden, true);

  const kept = renderChatFavicon(
    { href: "https://example.com/" },
    {
      omitTitle: true,
      keepVisibleOnMiss: true,
      siteFaviconUrls: () => [],
      networkFaviconUrls: () => ["https://fail.example/icon.png"]
    }
  );
  kept.listeners.error[0]({ currentTarget: kept });
  assert.equal(kept.hidden, false);
  assert.equal(kept.dataset.faviconMiss, "1");
  assert.equal(kept.dataset.faviconReady, undefined);
  assert.match(String(kept.className), /settings-site-icon-empty/);

  const oversized = renderChatFavicon(
    { href: "https://0-0.pro/" },
    {
      omitTitle: true,
      siteFaviconUrls: () => ["https://0-0.pro/favicon.ico", "https://icons.duckduckgo.com/ip3/0-0.pro.ico"],
      networkFaviconUrls: () => []
    }
  );
  oversized.naturalWidth = 1024;
  oversized.naturalHeight = 1024;
  oversized.listeners.load[0]({ currentTarget: oversized });
  assert.notEqual(oversized.dataset.faviconReady, "1");
  assert.match(oversized.src, /icons\.duckduckgo\.com\/ip3\/0-0\.pro\.ico$/);

  const tiny = renderChatFavicon(
    { href: "https://www.kimi.com/" },
    {
      omitTitle: true,
      siteFaviconUrls: () => ["https://www.kimi.com/favicon.ico", "https://www.kimi.com/favicon-dark.ico"],
      networkFaviconUrls: () => []
    }
  );
  tiny.naturalWidth = 16;
  tiny.naturalHeight = 16;
  tiny.listeners.load[0]({ currentTarget: tiny });
  assert.notEqual(tiny.dataset.faviconReady, "1");
  assert.equal(tiny.src, "https://www.kimi.com/favicon-dark.ico");

  const lyingIco = renderChatFavicon(
    { href: "https://0-0.pro/" },
    {
      omitTitle: true,
      siteFaviconUrls: () => ["https://0-0.pro/favicon.ico", "https://0-0.pro/fallback.png"],
      networkFaviconUrls: () => [],
      rememberDecodedFavicon: async () => ""
    }
  );
  lyingIco.naturalWidth = 256;
  lyingIco.naturalHeight = 256;
  await lyingIco.listeners.load[0]({ currentTarget: lyingIco });
  assert.notEqual(lyingIco.dataset.faviconReady, "1");
  assert.equal(lyingIco.src, "https://0-0.pro/fallback.png");

  const okRasterBlob = "data:image/png;base64,AAAA";
  const remount = renderChatFavicon(
    { href: "https://poe.com/", logoUrl: okRasterBlob },
    { omitTitle: true, siteFaviconUrls: () => ["https://poe.com/favicon.svg"], networkFaviconUrls: () => [] }
  );
  assert.equal(remount.src, okRasterBlob);
  assert.equal(remount.dataset.faviconReady, "1", "accepted raster blobs must paint immediately-ready on remount");
  assert.notEqual(remount.dataset.faviconRemote, "1");

  const emptySvg = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
  const empty = renderChatFavicon(
    { href: "https://0-0.pro/", logoUrl: emptySvg },
    { omitTitle: true, siteFaviconUrls: () => ["https://0-0.pro/favicon.svg"], networkFaviconUrls: () => [] }
  );
  assert.notEqual(empty.dataset.faviconReady, "1", "empty SVG must not paint immediately-ready");

  const declaredPng = "https://www.gstatic.com/lamda/images/gemini_sparkle_4g_512_lt.png";
  const gemini = renderChatFavicon(
    { href: "https://gemini.google.com/", logoUrl: declaredPng },
    { omitTitle: true, siteFaviconUrls: () => [], networkFaviconUrls: () => [] }
  );
  assert.equal(gemini.dataset.faviconRemote, "1");
  gemini.naturalWidth = 512;
  gemini.naturalHeight = 512;
  gemini.listeners.load[0]({ currentTarget: gemini });
  assert.equal(gemini.src, declaredPng);
  assert.equal(gemini.dataset.faviconReady, "1");
  assert.notEqual(gemini.dataset.faviconRemote, "1");

  const painted = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="6"/></svg>');
  const ring = renderChatFavicon(
    { href: "https://0-0.pro/", logoUrl: painted },
    { omitTitle: true, siteFaviconUrls: () => [], networkFaviconUrls: () => [] }
  );
  assert.equal(ring.src, painted);
  assert.equal(ring.dataset.faviconReady, "1");

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
