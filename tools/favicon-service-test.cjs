#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const vm = require("node:vm");
const { functionSource } = require("./function-source.cjs");

const root = path.resolve(__dirname, "..");

function runtimeUrl(protocol, pathValue = "") {
  const path = String(pathValue || "").replace(/^\/+/, "");
  return `${protocol}//chatclub/${path}`;
}

function link(attributes = {}) {
  return {
    getAttribute(name) { return attributes[name] || ""; }
  };
}

(async () => {
  const { createFaviconService } = await import(
    `${pathToFileURL(path.join(root, "app/favicon/service.js")).href}?test=${Date.now()}`
  );
  const create = ({ protocol, permissions = [], pageHtmlLinks = [] }) => createFaviconService({
    state: { faviconCache: {} },
    storageGet: async () => ({}),
    storageSet: async () => {},
    runtimeGetUrl: (value) => runtimeUrl(protocol, value),
    runtimeGetManifest: () => ({ permissions }),
    inferAppName: (app) => app?.name || "Example",
    fetchPage: async () => ({ ok: true, text: async () => "<html></html>" }),
    parseHtml: () => ({ querySelectorAll: () => pageHtmlLinks })
  });

  const firefox = create({ protocol: "moz-extension:", permissions: [] });
  assert.equal(
    firefox.browserUrl("https://chatgpt.com/"),
    "",
    "Firefox must not synthesize Chromium's private /_favicon endpoint"
  );
  assert.equal(firefox.effective("https://chatgpt.com/"), "");

  const chromium = create({ protocol: "chrome-extension:", permissions: ["favicon"] });
  const chromiumUrl = new URL(chromium.browserUrl("https://chatgpt.com/"));
  assert.equal(chromiumUrl.protocol, "chrome-extension:");
  assert.equal(chromiumUrl.pathname, "/_favicon/");
  assert.equal(chromiumUrl.searchParams.get("pageUrl"), "https://chatgpt.com/");
  assert.equal(chromiumUrl.searchParams.get("size"), "32");

  const chromiumWithoutPermission = create({ protocol: "chrome-extension:", permissions: [] });
  assert.equal(chromiumWithoutPermission.browserUrl("https://chatgpt.com/"), "");

  const cdnIcon = "https://cdn.oaistatic.com/assets/chatgpt-brand.svg";
  assert.equal(
    firefox.effective("https://chatgpt.com/", cdnIcon),
    cdnIcon,
    "a page-declared HTTPS CDN icon must outrank browser-specific fallback logic"
  );
  firefox.remember("https://chatgpt.com/", cdnIcon);
  assert.equal(firefox.effective("https://chatgpt.com/"), cdnIcon);
  assert.equal(
    firefox.effective("https://chatgpt.com/", "http://cdn.example.com/icon.png"),
    cdnIcon,
    "an HTTPS page must reject a downgraded declared icon"
  );
  assert.equal(
    create({ protocol: "moz-extension:" }).effective(
      "https://chatgpt.com/",
      "https://user:secret@cdn.example.com/icon.png"
    ),
    "",
    "credential-bearing icon URLs must fail closed"
  );

  const discovered = create({
    protocol: "moz-extension:",
    pageHtmlLinks: [link({
      rel: "icon",
      href: "https://www.gstatic.com/lamda/images/gemini_sparkle_4g_512_lt.png",
      sizes: "32x32",
      type: "image/png"
    })]
  });
  assert.equal(
    await discovered.discover("https://gemini.google.com/app"),
    "https://www.gstatic.com/lamda/images/gemini_sparkle_4g_512_lt.png",
    "fallback discovery must preserve a safe cross-origin declared favicon"
  );

  const summarySource = fs.readFileSync(path.join(root, "app/summary/controller.js"), "utf8");
  const summaryContext = vm.createContext({
    effectiveFaviconUrl: () => "",
    summaryTabFaviconUrl: () => "https://safe.example/tab-icon.png"
  });
  const summaryLogoUrl = vm.runInContext(
    `(${functionSource(summarySource, "summaryFrameLogoUrl")})`,
    summaryContext
  );
  assert.equal(
    summaryLogoUrl("frame-1", "https://chatgpt.com/", "http://user:secret@bad.example/icon.png"),
    "https://safe.example/tab-icon.png",
    "Summary must not restore a declared URL rejected by the favicon service"
  );

  const workspaceSource = fs.readFileSync(path.join(root, "app/workspace/frame-controller.js"), "utf8");
  const workspaceImage = { src: "untouched", dataset: {}, hidden: true };
  const workspaceIframe = { dataset: { instanceId: "frame-1" }, isConnected: true };
  const workspaceContext = vm.createContext({
    iframeForWindow: () => workspaceIframe,
    frameApp: () => ({ url: "https://chatgpt.com/" }),
    sendToContentFrame: async () => ({
      href: "https://chatgpt.com/",
      logoUrl: "http://user:secret@bad.example/icon.png"
    }),
    rememberFrameLocation: () => {},
    effectiveFaviconUrl: () => "",
    discoverDeclaredFaviconUrl: async () => "",
    rememberFaviconUrl: () => {},
    document: { querySelector: () => workspaceImage }
  });
  const syncFrameFavicon = vm.runInContext(
    `(${functionSource(workspaceSource, "syncFrameFavicon")})`,
    workspaceContext
  );
  await syncFrameFavicon(workspaceIframe);
  assert.equal(
    workspaceImage.src,
    "untouched",
    "workspace tabs must not restore a page-declared URL rejected by the favicon service"
  );
  console.log("Favicon service browser-target and declared-icon checks passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
