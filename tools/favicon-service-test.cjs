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
  const create = ({ protocol, permissions = [], pageHtmlLinks = [], options = {} }) => createFaviconService({
    state: { faviconCache: {}, options },
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
  assert.equal(
    firefox.effective("https://chatgpt.com/"),
    "https://chatgpt.com/favicon.ico",
    "Firefox auto-fetch must start at the site favicon, not Chromium /_favicon_"
  );
  assert.ok(
    firefox.candidates("https://chatgpt.com/").some((url) => /icons\.duckduckgo\.com\/ip3\/chatgpt\.com\.ico$/.test(url)),
    "DuckDuckGo must stay a network candidate after the site favicon"
  );
  assert.ok(
    firefox.networkUrls("https://chatgpt.com/").includes("https://www.google.com/s2/favicons?domain=chatgpt.com&sz=64"),
    "Google s2 must stay a network candidate, never the only path"
  );

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
  assert.doesNotMatch(
    create({ protocol: "moz-extension:" }).effective(
      "https://chatgpt.com/",
      "https://user:secret@cdn.example.com/icon.png"
    ),
    /user:secret/,
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
  const overrideIcon = "https://cdn.example.com/custom-icon.png";
  const overridden = create({
    protocol: "moz-extension:",
    options: { appIcons: { ChatGPT: { srcType: "url", value: overrideIcon } } }
  });
  assert.equal(
    overridden.effective("https://chatgpt.com/", cdnIcon, { appId: "ChatGPT" }),
    overrideIcon,
    "a user override must outrank a declared HTTPS icon"
  );
  assert.equal(overridden.app({ id: "ChatGPT", url: "https://chatgpt.com/" }), overrideIcon);
  assert.equal(
    overridden.effective("https://chatgpt.com/", cdnIcon),
    cdnIcon,
    "effective() stays backward compatible when appId is omitted"
  );

  const dataIcon = "data:image/png;base64,AAAA";
  const dataOverridden = create({
    protocol: "moz-extension:",
    options: { appIcons: { ChatGPT: { srcType: "data", value: dataIcon } } }
  });
  assert.equal(dataOverridden.overrideUrl("ChatGPT"), dataIcon);

  const cacheState = { faviconCache: {}, options: {} };
  const rememberer = createFaviconService({
    state: cacheState,
    storageGet: async () => ({}),
    storageSet: async () => {},
    runtimeGetUrl: (value) => runtimeUrl("moz-extension:", value),
    runtimeGetManifest: () => ({ permissions: [] }),
    inferAppName: (app) => app?.name || "Example",
    fetchPage: async () => ({ ok: true, text: async () => "<html></html>" }),
    parseHtml: () => ({ querySelectorAll: () => [] })
  });
  rememberer.remember("https://chatgpt.com/", rememberer.networkUrls("https://chatgpt.com/")[0]);
  rememberer.remember("https://chatgpt.com/", "https://www.google.com/s2/favicons?domain=chatgpt.com&sz=64");
  assert.deepEqual(cacheState.faviconCache, {}, "Google and DuckDuckGo URLs must not be remembered");
  rememberer.remember("https://chatgpt.com/", cdnIcon);
  assert.equal(cacheState.faviconCache["https://chatgpt.com/"]?.url, cdnIcon);

  const svgFile = new File(["<svg xmlns='http://www.w3.org/2000/svg'></svg>"], "icon.svg", { type: "image/svg+xml" });
  const encoded = await rememberer.encodeFile(svgFile);
  assert.match(encoded, /^data:image\/svg\+xml/);
  assert.equal(await rememberer.encodeFile(new File(["nope"], "icon.txt", { type: "text/plain" })), "");

  const candidates = overridden.candidates("https://chatgpt.com/", "", { appId: "ChatGPT" });
  assert.equal(candidates[0], overrideIcon);
  assert.ok(candidates.some((url) => url.includes("duckduckgo.com")));
  assert.ok(candidates.some((url) => url.includes("google.com/s2/favicons")));
  assert.ok(candidates.includes("https://chatgpt.com/favicon.ico"));

  const apiHref = "https://api.0-0.pro/v1/chat/completions";
  const apiUrls = firefox.networkUrls(apiHref);
  assert.deepEqual(apiUrls, [
    "https://icons.duckduckgo.com/ip3/api.0-0.pro.ico",
    "https://www.google.com/s2/favicons?domain=api.0-0.pro&sz=64",
    "https://icons.duckduckgo.com/ip3/0-0.pro.ico",
    "https://www.google.com/s2/favicons?domain=0-0.pro&sz=64"
  ]);
  const apiCandidates = firefox.candidates(apiHref);
  assert.equal(apiCandidates[0], "https://api.0-0.pro/favicon.ico");
  assert.ok(apiCandidates.includes("https://0-0.pro/favicon.ico"));
  assert.ok(!apiCandidates.some((url) => url.includes("/_favicon/")));
  assert.ok(apiCandidates.indexOf("https://api.0-0.pro/favicon.ico") < apiCandidates.indexOf(apiUrls[0]));
  assert.ok(apiCandidates.indexOf("https://www.google.com/s2/favicons?domain=0-0.pro&sz=64") > apiCandidates.indexOf(apiUrls[0]));

  const chromiumApi = chromium.candidates(apiHref);
  assert.ok(!chromiumApi.some((url) => url.includes("/_favicon/")), "API endpoints must not start with Chromium's default globe");
  assert.ok(chromium.candidates("https://chatgpt.com/").some((url) => url.includes("/_favicon/")));

  const fetched = [];
  const apiDiscover = createFaviconService({
    state: { faviconCache: {}, options: {} },
    storageGet: async () => ({}),
    storageSet: async () => {},
    runtimeGetUrl: (value) => runtimeUrl("moz-extension:", value),
    runtimeGetManifest: () => ({ permissions: [] }),
    inferAppName: (app) => app?.name || "Example",
    fetchPage: async (url) => {
      fetched.push(String(url));
      if (String(url).endsWith("/favicon.ico")) {
        return { ok: true, headers: { get: () => "image/x-icon" }, text: async () => "" };
      }
      return { ok: true, headers: { get: () => "text/html" }, text: async () => "<html></html>" };
    },
    parseHtml: () => ({ querySelectorAll: () => [link({
      rel: "icon",
      href: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3C/svg%3E"
    })] })
  });
  assert.equal(
    await apiDiscover.refresh(apiHref),
    "https://api.0-0.pro/favicon.ico",
    "Refresh must discover origin /favicon.ico instead of a POST-only completions path"
  );
  assert.ok(!fetched.some((url) => url.includes("/v1/chat/completions")));
  assert.ok(fetched.includes("https://api.0-0.pro/"));
  assert.equal(apiDiscover.effective(apiHref), "https://api.0-0.pro/favicon.ico");
  const dataDeclared = create({
    protocol: "moz-extension:",
    pageHtmlLinks: [link({
      rel: "icon",
      href: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3C/svg%3E"
    })]
  });
  assert.equal(await dataDeclared.discover("https://0-0.pro/"), "", "HTML data: placeholder icons must not be remembered");

  console.log("Favicon service browser-target and declared-icon checks passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
