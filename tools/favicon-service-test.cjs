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
  const lookup = await import(
    `${pathToFileURL(path.join(root, "shared/favicon-lookup.js")).href}?test=${Date.now()}`
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
    "https://chatgpt.com/favicon.svg",
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
  const apiHref = "https://api.0-0.pro/v1/chat/completions";
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
  rememberer.remember(apiHref, cdnIcon);
  assert.equal(
    cacheState.faviconCache[apiHref],
    undefined,
    "API completions paths must not become favicon cache keys"
  );
  assert.equal(cacheState.faviconCache["https://api.0-0.pro/"]?.url, cdnIcon);
  const painted = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="7"/></svg>');
  await rememberer.rememberDecoded("https://0-0.pro/", painted);
  assert.equal(cacheState.faviconCache["blob:0-0.pro"]?.url, painted);
  assert.equal(cacheState.faviconCache["blob:0-0.pro"]?.quality, "brand-svg");
  assert.equal(rememberer.candidates("https://0-0.pro/")[0], painted, "decoded blobs must outrank guessed site icons");
  const letter = rememberer.fallback({ id: "0.0", url: "https://letter.example/", name: "0.0" });
  await rememberer.rememberDecoded("https://letter.example/", letter);
  assert.equal(
    cacheState.faviconCache["blob:letter.example"],
    undefined,
    "letter fallback glyphs must never be remembered as brand-svg"
  );
  const okRaster = "data:image/png;base64,AAAA";
  cacheState.faviconCache["blob:poe.com"] = {
    url: okRaster,
    quality: "ok-raster",
    width: 32,
    height: 32,
    source: "decoded",
    updatedAt: 1
  };
  assert.equal(
    rememberer.candidates("https://poe.com/")[0],
    okRaster,
    "ok-raster blobs must be first-paint candidates"
  );
  assert.equal(
    rememberer.candidates("https://www.poe.com/")[0],
    okRaster,
    "Settings tabs must share the peeled-host blob"
  );
  assert.equal(
    rememberer.candidates("https://0-0.pro/register")[0],
    painted,
    "Provider registerUrl must share Apps origin blob"
  );
  await rememberer.rememberDecoded("https://www.kimi.com/", okRaster);
  assert.equal(cacheState.faviconCache["blob:kimi.com"]?.url, okRaster);
  assert.ok(lookup.isFaviconQuality(cacheState.faviconCache["blob:kimi.com"]?.quality));

  const quotaState = { faviconCache: {}, options: {} };
  const quota = createFaviconService({
    state: quotaState,
    storageGet: async () => ({}),
    storageSet: async () => {
      throw new Error("QUOTA_BYTES");
    },
    runtimeGetUrl: (value) => runtimeUrl("moz-extension:", value),
    runtimeGetManifest: () => ({ permissions: [] }),
    inferAppName: (app) => app?.name || "Example",
    fetchPage: async () => {
      throw new Error("persist failure must not refetch");
    },
    parseHtml: () => ({ querySelectorAll: () => [] })
  });
  await quota.rememberDecoded("https://www.qwen.com/", painted);
  assert.equal(quota.candidates("https://qwen.com/")[0], painted, "persist failure must not clear L1");

  const remountHits = [];
  const remounted = createFaviconService({
    state: {
      faviconCache: {
        "blob:chatgpt.com": { url: painted, quality: "brand-svg", updatedAt: 1 }
      },
      options: {}
    },
    storageGet: async () => ({}),
    storageSet: async () => {},
    runtimeGetUrl: (value) => runtimeUrl("moz-extension:", value),
    runtimeGetManifest: () => ({ permissions: [] }),
    inferAppName: (app) => app?.name || "Example",
    fetchPage: async (url) => {
      remountHits.push(String(url));
      return { ok: false };
    },
    parseHtml: () => ({ querySelectorAll: () => [] })
  });
  assert.equal(await remounted.discover("https://chatgpt.com/"), painted);
  assert.equal(await remounted.discover("https://chatgpt.com/"), painted);
  assert.equal(remounted.candidates("https://chatgpt.com/")[0], painted);
  assert.equal(remountHits.length, 0, "same-session remount must not refetch a cached blob");
  assert.ok(remounted.candidates("https://chatgpt.com/").some((url) => url.includes("duckduckgo.com")));
  assert.ok(remounted.candidates("https://chatgpt.com/").some((url) => url.includes("google.com/s2/favicons")));
  assert.ok(!Object.values(quotaState.faviconCache).some((entry) => lookup.isNetworkFavicon(entry?.url)));

  const svgFile = new File(["<svg xmlns='http://www.w3.org/2000/svg'></svg>"], "icon.svg", { type: "image/svg+xml" });
  const encoded = await rememberer.encodeFile(svgFile);
  assert.match(encoded, /^data:image\/svg\+xml/);
  assert.equal(await rememberer.encodeFile(new File(["nope"], "icon.txt", { type: "text/plain" })), "");

  const candidates = overridden.candidates("https://chatgpt.com/", "", { appId: "ChatGPT" });
  assert.equal(candidates[0], overrideIcon);
  assert.ok(candidates.some((url) => url.includes("duckduckgo.com")));
  assert.ok(candidates.some((url) => url.includes("google.com/s2/favicons")));
  assert.ok(candidates.includes("https://chatgpt.com/favicon.ico"));

  const apiUrls = firefox.networkUrls(apiHref);
  assert.deepEqual(apiUrls, [
    "https://www.google.com/s2/favicons?domain=api.0-0.pro&sz=64",
    "https://icons.duckduckgo.com/ip3/api.0-0.pro.ico",
    "https://www.google.com/s2/favicons?domain=0-0.pro&sz=64",
    "https://icons.duckduckgo.com/ip3/0-0.pro.ico"
  ]);
  const apiCandidates = firefox.candidates(apiHref);
  assert.equal(apiCandidates[0], "https://api.0-0.pro/favicon.svg");
  assert.ok(apiCandidates.includes("https://api.0-0.pro/favicon.ico"));
  assert.ok(apiCandidates.includes("https://0-0.pro/favicon.ico"));
  assert.ok(apiCandidates.includes("https://0-0.pro/favicon.svg"));
  assert.ok(!apiCandidates.some((url) => url.includes("/_favicon/")));
  assert.ok(apiCandidates.indexOf("https://api.0-0.pro/favicon.svg") < apiCandidates.indexOf("https://api.0-0.pro/favicon.ico"));
  assert.ok(apiCandidates.indexOf("https://api.0-0.pro/favicon.ico") < apiCandidates.indexOf(apiUrls[0]));
  assert.ok(apiCandidates.indexOf("https://www.google.com/s2/favicons?domain=0-0.pro&sz=64") > apiCandidates.indexOf(apiUrls[0]));

  const chromiumApi = chromium.candidates(apiHref);
  assert.ok(!chromiumApi.some((url) => url.includes("/_favicon/")), "API endpoints must not start with Chromium's default globe");
  const chatCandidates = chromium.candidates("https://chatgpt.com/");
  const browserIndex = chatCandidates.findIndex((url) => url.includes("/_favicon/"));
  const googleIndex = chatCandidates.findIndex((url) => url.includes("google.com/s2/favicons"));
  const ddgIndex = chatCandidates.findIndex((url) => url.includes("duckduckgo.com"));
  assert.ok(browserIndex > 0);
  assert.ok(browserIndex > googleIndex && browserIndex > ddgIndex, "Chromium generic _favicon_ must follow site and network lookups");
  assert.ok(chatCandidates.includes("https://chatgpt.com/favicon.svg"));

  const deepseek = firefox.candidates("https://chat.deepseek.com/");
  assert.equal(deepseek[0], "https://chat.deepseek.com/favicon.svg");
  assert.ok(deepseek.includes("https://chat.deepseek.com/favicon.ico"));
  assert.ok(deepseek.includes("https://deepseek.com/favicon.ico"), "chat. must peel to the registrable parent");
  assert.ok(deepseek.includes("https://deepseek.com/favicon.svg"));
  assert.ok(deepseek.indexOf("https://chat.deepseek.com/favicon.svg") < deepseek.indexOf("https://chat.deepseek.com/favicon.ico"));
  assert.ok(deepseek.indexOf("https://deepseek.com/favicon.ico") < deepseek.findIndex((url) => url.includes("google.com/s2/favicons")));
  assert.ok(!deepseek.some((url) => url.includes("/_favicon/")));

  const notion = firefox.candidates("https://app.notion.com/ai");
  assert.ok(notion.includes("https://app.notion.com/favicon.ico"));
  assert.ok(!notion.includes("https://notion.com/favicon.ico"), "do not strip arbitrary product labels");

  const lyingSvg = create({
    protocol: "moz-extension:",
    pageHtmlLinks: [
      link({ rel: "icon", href: "/favicon.ico", type: "image/x-icon" }),
      link({ rel: "icon", href: "https://fe-static.deepseek.com/chat/favicon.svg", type: "image/x-icon" })
    ]
  });
  assert.equal(
    await lyingSvg.discover("https://chat.deepseek.com/"),
    "https://fe-static.deepseek.com/chat/favicon.svg",
    "a .svg href must outrank a lying type=image/x-icon ICO"
  );

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
  const paintedDeclared = create({
    protocol: "moz-extension:",
    pageHtmlLinks: [link({
      rel: "icon",
      href: painted,
      type: "image/svg+xml"
    })]
  });
  assert.equal(
    await paintedDeclared.discover("https://0-0.pro/register"),
    painted,
    "painted HTTPS-page data: SVG icons must be accepted"
  );

  function pngBytes(width, height) {
    const bytes = new Uint8Array(24);
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
    bytes[16] = (width >>> 24) & 255;
    bytes[17] = (width >>> 16) & 255;
    bytes[18] = (width >>> 8) & 255;
    bytes[19] = width & 255;
    bytes[20] = (height >>> 24) & 255;
    bytes[21] = (height >>> 16) & 255;
    bytes[22] = (height >>> 8) & 255;
    bytes[23] = height & 255;
    return bytes;
  }

  function icoWithPng(width, height) {
    const png = pngBytes(width, height);
    const header = new Uint8Array(22);
    header[2] = 1;
    header[4] = 1;
    header[18] = 22;
    const out = new Uint8Array(22 + png.length);
    out.set(header, 0);
    out.set(png, 22);
    return out;
  }

  assert.equal(lookup.rasterPixelSize(icoWithPng(1024, 1024)).width, 1024);
  assert.equal(lookup.isRejectedGuessedRaster("https://0-0.pro/favicon.ico", 1024, 1024), true);
  assert.equal(lookup.isRejectedGuessedRaster("https://0-0.pro/favicon.ico", 16, 16), true);
  assert.equal(lookup.isRejectedGuessedRaster("https://0-0.pro/favicon.ico", 256, 256), false);
  assert.equal(
    lookup.rejectedRasterBytes("https://0-0.pro/favicon.ico", icoWithPng(1024, 1024)),
    true,
    "PNG-in-ICO IHDR 1024 must reject even when the ICO directory says 256"
  );
  assert.equal(
    lookup.isRejectedGuessedRaster("https://www.gstatic.com/lamda/images/gemini_sparkle_4g_512_lt.png", 512, 512),
    false,
    "declared CDN PNGs must not be treated as guessed favicons"
  );
  assert.equal(lookup.acceptedDataIcon("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3C/svg%3E"), "");
  assert.equal(lookup.acceptedDataIcon(painted), painted);
  assert.equal(lookup.isImmediateReadyFavicon(painted), true);
  assert.equal(lookup.isImmediateReadyFavicon("data:image/png;base64,AAAA"), true);
  assert.equal(lookup.isImmediateReadyFavicon("https://0-0.pro/favicon.ico"), false);
  assert.equal(lookup.faviconDeclaredSizeScore({ sizes: "32x32", href: "https://www.typingmind.com/favicon-32x32.png" }), 3);
  assert.equal(lookup.faviconDeclaredSizeScore({ sizes: "192x192", href: "https://www.typingmind.com/android-icon-192x192.png" }), 0);
  assert.equal(lookup.faviconDeclaredSizeScore({ sizes: "16x16", href: "https://www.typingmind.com/favicon-16x16.png" }), 6);
  assert.equal(lookup.faviconDeclaredSizeScore({ href: "https://www.perplexity.ai/favicon.svg" }), 0);
  assert.match(
    fs.readFileSync(path.join(root, "app/favicon/service.js"), "utf8"),
    /Math\.min\(size \/ Math\.max\(bitmap\.width, 1\), size \/ Math\.max\(bitmap\.height, 1\)\)/
  );
  assert.doesNotMatch(
    fs.readFileSync(path.join(root, "app/favicon/service.js"), "utf8"),
    /Math\.min\(size \/ Math\.max\(bitmap\.width, 1\), size \/ Math\.max\(bitmap\.height, 1\), 1\)/
  );
  const solid = new Uint8Array(4 * 32);
  for (let index = 0; index < 32; index += 1) {
    solid[index * 4] = 6;
    solid[index * 4 + 1] = 6;
    solid[index * 4 + 2] = 6;
    solid[index * 4 + 3] = 255;
  }
  assert.equal(lookup.isNearSolidRgba(solid), true);
  const twoTone = new Uint8Array(4 * 32);
  for (let index = 0; index < 20; index += 1) twoTone[index * 4 + 3] = 255;
  for (let index = 20; index < 32; index += 1) {
    twoTone[index * 4] = 255;
    twoTone[index * 4 + 1] = 255;
    twoTone[index * 4 + 2] = 255;
    twoTone[index * 4 + 3] = 255;
  }
  assert.equal(lookup.isNearSolidRgba(twoTone), false);

  const oversizedFetched = [];
  const oversized = createFaviconService({
    state: { faviconCache: {}, options: {} },
    storageGet: async () => ({}),
    storageSet: async () => {},
    runtimeGetUrl: (value) => runtimeUrl("moz-extension:", value),
    runtimeGetManifest: () => ({ permissions: [] }),
    inferAppName: (app) => app?.name || "Example",
    fetchPage: async (url) => {
      oversizedFetched.push(String(url));
      if (String(url).endsWith("/favicon.ico")) {
        const body = icoWithPng(1024, 1024);
        return {
          ok: true,
          headers: { get: () => "image/x-icon" },
          arrayBuffer: async () => body,
          text: async () => ""
        };
      }
      if (String(url).endsWith("/favicon.svg")) {
        return { ok: false, headers: { get: () => "text/html" }, text: async () => "" };
      }
      return { ok: true, headers: { get: () => "text/html" }, text: async () => "<html></html>" };
    },
    parseHtml: () => ({ querySelectorAll: () => [] })
  });
  assert.equal(
    await oversized.discover("https://0-0.pro/"),
    "",
    "guessed /favicon.ico rasters at 512px or larger must not be remembered"
  );
  assert.ok(oversizedFetched.includes("https://0-0.pro/favicon.ico"));

  const migratedState = { faviconCache: {}, options: {} };
  const migrator = createFaviconService({
    state: migratedState,
    storageGet: async (key) => {
      if (key === "chatclub.faviconCache.v4") {
        return {
          "https://chatgpt.com/": { url: cdnIcon, updatedAt: 1 },
          "https://0-0.pro/": { url: "https://0-0.pro/favicon.ico", updatedAt: 2 },
          "https://chatgpt.com/ddg": { url: "https://icons.duckduckgo.com/ip3/chatgpt.com.ico", updatedAt: 3 }
        };
      }
      return {};
    },
    storageSet: async () => {},
    runtimeGetUrl: (value) => runtimeUrl("moz-extension:", value),
    runtimeGetManifest: () => ({ permissions: [] }),
    inferAppName: (app) => app?.name || "Example",
    fetchPage: async () => ({ ok: true, text: async () => "<html></html>" }),
    parseHtml: () => ({ querySelectorAll: () => [] })
  });
  await migrator.load();
  assert.equal(migratedState.faviconCache["https://chatgpt.com/"]?.url, cdnIcon);
  assert.equal(migratedState.faviconCache["https://0-0.pro/"], undefined, "v4 guessed ico pointers must not become v8 blobs");
  assert.equal(migratedState.faviconCache["https://chatgpt.com/ddg"], undefined);
  assert.match(fs.readFileSync(path.join(root, "app/favicon/service.js"), "utf8"), /chatclub\.faviconCache\.v8/);

  const v5State = { faviconCache: {}, options: {} };
  const boltPng = "data:image/png;base64,AAAA";
  const v5Migrator = createFaviconService({
    state: v5State,
    storageGet: async (key) => {
      if (key === "chatclub.faviconCache.v5") {
        return {
          "blob:0-0.pro": { url: boltPng, updatedAt: 1 },
          "blob:perplexity.ai": { url: painted, updatedAt: 2 },
          "https://chatgpt.com/": { url: cdnIcon, updatedAt: 3 },
          "https://0-0.pro/": { url: "https://0-0.pro/favicon.ico", updatedAt: 4 }
        };
      }
      return {};
    },
    storageSet: async () => {},
    runtimeGetUrl: (value) => runtimeUrl("moz-extension:", value),
    runtimeGetManifest: () => ({ permissions: [] }),
    inferAppName: (app) => app?.name || "Example",
    fetchPage: async () => ({ ok: true, text: async () => "<html></html>" }),
    parseHtml: () => ({ querySelectorAll: () => [] })
  });
  await v5Migrator.load();
  assert.equal(v5State.faviconCache["blob:0-0.pro"], undefined, "v5 guessed-path raster blobs must be discarded");
  assert.equal(v5State.faviconCache["blob:perplexity.ai"]?.url, painted);
  assert.equal(v5State.faviconCache["blob:perplexity.ai"]?.quality, "brand-svg");
  assert.equal(v5State.faviconCache["https://chatgpt.com/"]?.url, cdnIcon);
  assert.equal(v5State.faviconCache["https://0-0.pro/"], undefined);
  assert.notEqual(v5Migrator.candidates("https://0-0.pro/")[0], boltPng);
  assert.equal(v5Migrator.candidates("https://www.perplexity.ai/")[0], painted);

  const v6State = { faviconCache: {}, options: {} };
  const v6Migrator = createFaviconService({
    state: v6State,
    storageGet: async (key) => {
      if (key === "chatclub.faviconCache.v6") {
        return {
          "blob:kimi.com": { url: boltPng, quality: "ok-raster", width: 128, height: 128, updatedAt: 1 },
          "blob:perplexity.ai": { url: painted, quality: "brand-svg", updatedAt: 2 }
        };
      }
      return {};
    },
    storageSet: async () => {},
    runtimeGetUrl: (value) => runtimeUrl("moz-extension:", value),
    runtimeGetManifest: () => ({ permissions: [] }),
    inferAppName: (app) => app?.name || "Example",
    fetchPage: async () => ({ ok: true, text: async () => "<html></html>" }),
    parseHtml: () => ({ querySelectorAll: () => [] })
  });
  await v6Migrator.load();
  assert.equal(v6State.faviconCache["blob:kimi.com"], undefined, "v6 padded raster blobs must be discarded");
  assert.equal(v6State.faviconCache["blob:perplexity.ai"]?.url, painted);
  assert.notEqual(v6Migrator.candidates("https://www.kimi.com/")[0], boltPng);

  const v7State = { faviconCache: {}, options: {} };
  const v7Migrator = createFaviconService({
    state: v7State,
    storageGet: async (key) => {
      if (key === "chatclub.faviconCache.v7") {
        return {
          "blob:kimi.com": { url: okRaster, quality: "ok-raster", width: 128, height: 128, updatedAt: 1 },
          "blob:perplexity.ai": { url: painted, quality: "brand-svg", updatedAt: 2 },
          "https://chatgpt.com/": { url: cdnIcon, updatedAt: 3 }
        };
      }
      return {};
    },
    storageSet: async () => {},
    runtimeGetUrl: (value) => runtimeUrl("moz-extension:", value),
    runtimeGetManifest: () => ({ permissions: [] }),
    inferAppName: (app) => app?.name || "Example",
    fetchPage: async () => ({ ok: true, text: async () => "<html></html>" }),
    parseHtml: () => ({ querySelectorAll: () => [] })
  });
  await v7Migrator.load();
  assert.equal(v7State.faviconCache["blob:kimi.com"]?.url, okRaster, "v7 accepted rasters must migrate into v8");
  assert.equal(v7State.faviconCache["blob:perplexity.ai"]?.url, painted);
  assert.equal(v7State.faviconCache["https://chatgpt.com/"], undefined, "v7 https pointers must not become v8 paint hits");
  assert.equal(v7Migrator.candidates("https://www.kimi.com/")[0], okRaster);

  const pointerHits = [];
  const pointerOnly = createFaviconService({
    state: {
      faviconCache: {
        "https://www.kimi.com/": { url: "https://www.kimi.com/favicon.ico", quality: "declared-raster", updatedAt: 1 }
      },
      options: {}
    },
    storageGet: async () => ({}),
    storageSet: async () => {},
    runtimeGetUrl: (value) => runtimeUrl("moz-extension:", value),
    runtimeGetManifest: () => ({ permissions: [] }),
    inferAppName: (app) => app?.name || "Example",
    fetchPage: async (url) => {
      pointerHits.push(String(url));
      return { ok: false };
    },
    parseHtml: () => ({ querySelectorAll: () => [] })
  });
  await pointerOnly.discover("https://www.kimi.com/");
  assert.ok(pointerHits.length > 0, "https pointers must not short-circuit discover");

  const previousMatchMedia = globalThis.matchMedia;
  globalThis.matchMedia = (query) => ({ matches: String(query).includes("prefers-color-scheme: dark") });
  try {
    const kimi = create({
      protocol: "moz-extension:",
      pageHtmlLinks: [
        link({ rel: "icon", href: "/favicon.ico", type: "image/x-icon" }),
        link({ rel: "icon", href: "/favicon-light.ico", media: "(prefers-color-scheme: light)" }),
        link({ rel: "icon", href: "/favicon-dark.ico", media: "(prefers-color-scheme: dark)" })
      ]
    });
    assert.equal(
      await kimi.discover("https://www.kimi.com/"),
      "https://www.kimi.com/favicon-dark.ico",
      "dark color-scheme must prefer declared favicon-dark.ico"
    );
    const perplexity = create({
      protocol: "moz-extension:",
      pageHtmlLinks: [
        link({ rel: "icon", href: "/favicon.ico", type: "image/x-icon", sizes: "48x48" }),
        link({ rel: "icon", href: "/favicon.svg", type: "image/svg+xml" })
      ]
    });
    assert.equal(
      await perplexity.discover("https://www.perplexity.ai/"),
      "https://www.perplexity.ai/favicon.svg",
      "declared SVG must beat a guessed 48px ICO"
    );
    const typingmind = create({
      protocol: "moz-extension:",
      pageHtmlLinks: [
        link({ rel: "icon", href: "/favicon-16x16.png", type: "image/png", sizes: "16x16" }),
        link({ rel: "icon", href: "/favicon-32x32.png", type: "image/png", sizes: "32x32" }),
        link({ rel: "icon", href: "/android-icon-192x192.png", type: "image/png", sizes: "192x192" })
      ]
    });
    assert.equal(
      await typingmind.discover("https://www.typingmind.com/"),
      "https://www.typingmind.com/android-icon-192x192.png",
      "declared 192px PNG must beat 32px and 16px icons"
    );
  } finally {
    if (previousMatchMedia === undefined) delete globalThis.matchMedia;
    else globalThis.matchMedia = previousMatchMedia;
  }

  const peeledFetched = [];
  const peeled = createFaviconService({
    state: { faviconCache: {}, options: {} },
    storageGet: async () => ({}),
    storageSet: async () => {},
    runtimeGetUrl: (value) => runtimeUrl("moz-extension:", value),
    runtimeGetManifest: () => ({ permissions: [] }),
    inferAppName: (app) => app?.name || "Example",
    fetchPage: async (url) => {
      peeledFetched.push(String(url));
      return { ok: true, headers: { get: () => "text/html" }, text: async () => "<html></html>" };
    },
    parseHtml: () => ({ querySelectorAll: () => [] })
  });
  await peeled.discover("https://api.0-0.pro/v1/chat/completions");
  const afterFirst = peeledFetched.length;
  await peeled.discover("https://0-0.pro/");
  await peeled.discover("https://api.0-0.pro/v1/chat/completions");
  assert.equal(afterFirst > 0, true);
  assert.equal(peeledFetched.length, afterFirst, "discover must run once per peeled host");
  assert.ok(!peeledFetched.some((url) => url.includes("/v1/chat/completions")));

  function listenerHub() {
    const listeners = [];
    return {
      addListener(fn) { listeners.push(fn); },
      fire(...args) { for (const fn of listeners) fn(...args); }
    };
  }

  const whale = "https://fe-static.deepseek.com/chat/favicon.svg";
  const tabState = { faviconCache: {}, options: {} };
  const tabService = createFaviconService({
    state: tabState,
    storageGet: async () => ({}),
    storageSet: async () => {},
    runtimeGetUrl: (value) => runtimeUrl("moz-extension:", value),
    runtimeGetManifest: () => ({ permissions: [] }),
    inferAppName: (app) => app?.name || "Example",
    fetchPage: async () => ({ ok: true, text: async () => "<html></html>" }),
    parseHtml: () => ({ querySelectorAll: () => [] })
  });
  const updated = listenerHub();
  const removed = listenerHub();
  let tabChanges = 0;
  await tabService.observeTabs({
    queryTabs: async () => [{
      id: 7,
      url: "https://chat.deepseek.com/a/chat/s/1",
      favIconUrl: whale,
      active: true
    }],
    onUpdated: updated,
    onRemoved: removed,
    onChange: () => { tabChanges += 1; }
  });
  await new Promise((resolve) => {
    setTimeout(resolve, 250);
  });
  assert.equal(tabService.tabUrl("https://chat.deepseek.com/"), whale);
  assert.equal(
    tabService.effective("https://chat.deepseek.com/"),
    whale,
    "an open tab's favIconUrl must outrank guessed /favicon.ico"
  );
  assert.equal(
    tabService.effective("https://www.deepseek.com/"),
    whale,
    "chat. / www. / apex hosts of the same site share the live tab icon"
  );
  assert.equal(tabState.faviconCache["https://chat.deepseek.com/a/chat/s/1"]?.url, whale);
  assert.ok(tabChanges >= 1, "observing an open tab must notify once the icon is ingested");

  const blobOverTab = createFaviconService({
    state: {
      faviconCache: {
        "blob:deepseek.com": { url: painted, quality: "brand-svg", updatedAt: 1 }
      },
      options: {}
    },
    storageGet: async () => ({}),
    storageSet: async () => {},
    runtimeGetUrl: (value) => runtimeUrl("moz-extension:", value),
    runtimeGetManifest: () => ({ permissions: [] }),
    inferAppName: (app) => app?.name || "Example",
    fetchPage: async () => ({ ok: true, text: async () => "<html></html>" }),
    parseHtml: () => ({ querySelectorAll: () => [] })
  });
  await blobOverTab.observeTabs({
    queryTabs: async () => [{
      id: 9,
      url: "https://chat.deepseek.com/",
      favIconUrl: whale,
      active: true
    }]
  });
  assert.equal(
    blobOverTab.candidates("https://chat.deepseek.com/")[0],
    painted,
    "accepted peeled-host blobs must outrank live tab https"
  );
  assert.equal(blobOverTab.effective("https://www.deepseek.com/"), painted);

  const dataTabIcon = "data:image/png;base64,AAAA";
  updated.fire(7, { favIconUrl: dataTabIcon }, {
    id: 7,
    url: "https://chat.deepseek.com/a/chat/s/1",
    favIconUrl: dataTabIcon,
    active: true
  });
  assert.equal(tabService.tabUrl("https://chat.deepseek.com/"), dataTabIcon);
  assert.equal(tabService.effective("https://chat.deepseek.com/"), dataTabIcon);
  assert.equal(
    tabState.faviconCache["https://chat.deepseek.com/a/chat/s/1"]?.url,
    whale,
    "ephemeral data: tab icons must not replace a remembered HTTPS icon"
  );

  updated.fire(7, { favIconUrl: "chrome://favicon/size/16/https://chat.deepseek.com/" }, {
    id: 7,
    url: "https://chat.deepseek.com/",
    favIconUrl: "chrome://favicon/size/16/https://chat.deepseek.com/"
  });
  assert.equal(
    tabService.tabUrl("https://chat.deepseek.com/"),
    "",
    "chrome: tab favicons are not renderable in MV3 extension pages"
  );

  updated.fire(8, { favIconUrl: "https://www.notion.so/images/favicon.ico", url: "https://www.notion.so/" }, {
    id: 8,
    url: "https://www.notion.so/",
    favIconUrl: "https://www.notion.so/images/favicon.ico",
    active: true
  });
  assert.equal(
    tabService.tabUrl("https://app.notion.com/ai"),
    "",
    "do not steal a parent-site tab icon for an unpeeled product host"
  );

  const overrideTab = create({
    protocol: "moz-extension:",
    options: { appIcons: { DeepSeek: { srcType: "url", value: overrideIcon } } }
  });
  await overrideTab.observeTabs({
    queryTabs: async () => [{ id: 1, url: "https://chat.deepseek.com/", favIconUrl: whale, active: true }]
  });
  assert.equal(
    overrideTab.effective("https://chat.deepseek.com/", "", { appId: "DeepSeek" }),
    overrideIcon,
    "a user override must still outrank a live tab favicon"
  );
  assert.equal(
    overrideTab.effective("https://chat.deepseek.com/", "", { tabFaviconUrl: whale }),
    whale,
    "callers may pass an explicit tab favicon when they already have the Tab object"
  );

  removed.fire(7);
  assert.equal(tabService.tabUrl("https://chat.deepseek.com/"), "");

  const runtimeSource = fs.readFileSync(path.join(root, "app/runtime.js"), "utf8");
  assert.match(runtimeSource, /faviconService\.observeTabs\(/);
  assert.match(runtimeSource, /queryTabs:\s*tabsQuery/);
  assert.match(runtimeSource, /onUpdated:\s*tabsApi\?\.onUpdated/);

  console.log("Favicon service browser-target and declared-icon checks passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
