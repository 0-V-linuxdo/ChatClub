#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const dataModule = (source) => import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
const EXTENSION_SITE = "chrome-extension://abcdefghijklmnopabcdefghijklmnop";

function partitionId(details = {}) {
  const key = details.partitionKey || {};
  return JSON.stringify([
    String(details.storeId || ""),
    String(details.name || ""),
    String(key.topLevelSite || ""),
    Boolean(key.hasCrossSiteAncestor)
  ]);
}

function sourceCookie(name, value, overrides = {}) {
  return {
    name,
    value,
    domain: ".grok.com",
    hostOnly: false,
    path: "/",
    secure: true,
    httpOnly: name === "grok_device_id",
    sameSite: name === "sso-rw" ? "strict" : "lax",
    session: name !== "grok_device_id",
    storeId: "0",
    ...(name === "grok_device_id" ? { expirationDate: 2000000000 } : {}),
    ...overrides
  };
}

function fakeExtensionApi(sources = []) {
  const sourceByName = new Map(sources.map((cookie) => [cookie.name, { ...cookie }]));
  const targets = new Map();
  const setCalls = [];
  const removeCalls = [];
  const stored = {};
  return {
    sourceByName,
    targets,
    setCalls,
    removeCalls,
    stored,
    runtime: {
      getURL: () => `${EXTENSION_SITE}/`
    },
    storage: {
      local: {
        async get(key) {
          return { [key]: stored[key] };
        },
        async set(values) {
          Object.assign(stored, JSON.parse(JSON.stringify(values)));
        },
        async remove(key) {
          delete stored[key];
        }
      }
    },
    cookies: {
      async getAllCookieStores() {
        return [{ id: "0", tabIds: [7, 8] }, { id: "1", tabIds: [9] }];
      },
      async get(details) {
        if (details.partitionKey) return targets.get(partitionId(details)) || null;
        return sourceByName.get(details.name) || null;
      },
      async set(details) {
        setCalls.push({ ...details, partitionKey: { ...details.partitionKey } });
        const cookie = {
          name: details.name,
          value: details.value,
          domain: details.domain || new URL(details.url).hostname,
          hostOnly: !details.domain,
          path: details.path || "/",
          secure: Boolean(details.secure),
          httpOnly: Boolean(details.httpOnly),
          sameSite: details.sameSite,
          session: details.expirationDate === undefined,
          storeId: String(details.storeId || ""),
          partitionKey: { ...details.partitionKey },
          ...(details.expirationDate === undefined ? {} : { expirationDate: details.expirationDate })
        };
        targets.set(partitionId(details), cookie);
        return cookie;
      },
      async remove(details) {
        removeCalls.push({ ...details, partitionKey: { ...details.partitionKey } });
        const cookie = targets.get(partitionId(details)) || null;
        targets.delete(partitionId(details));
        return cookie ? { url: details.url, name: details.name, storeId: details.storeId } : null;
      }
    }
  };
}

async function releaseManagedCookie(bridge, { name, cause, value }) {
  const api = fakeExtensionApi([sourceCookie(name, value || `${name}-${cause}`)]);
  await bridge.syncGrokSessionCookies(api, { storeId: "0", partitionKey: { topLevelSite: EXTENSION_SITE, hasCrossSiteAncestor: true }, names: [name] });
  const key = { topLevelSite: EXTENSION_SITE, hasCrossSiteAncestor: true };
  const cookie = api.targets.get(partitionId({ name, storeId: "0", partitionKey: key }));
  assert.ok(cookie, `${name}/${cause}: managed target was not created`);
  assert.equal(
    bridge.grokCookieChangeOwnedByBridge({ removed: false, cookie }),
    true,
    `${name}/${cause}: bridge-owned set event was not consumed`
  );
  api.targets.delete(partitionId({ name, storeId: "0", partitionKey: key }));
  const released = await bridge.releaseChangedGrokPartition(api, { removed: true, cause, cookie });
  return { api, cookie, partitionKey: key, released };
}

(async () => {
  const bridge = await import(
    `${pathToFileURL(path.join(root, "background/grok-cookie-bridge.js")).href}?test=${Date.now()}`
  );
  const manifest = JSON.parse(read("manifest.json"));
  const grokRuntime = read("background/grok-cookie-runtime.js");
  const serviceWorker = `${read("background/service-worker.js")}\n${read("background/runtime.js")}\n${grokRuntime}`;
  const relay = read("content/grok-cookie-bridge.js");
  const workspace = `${read("app/workspace/controller.js")}\n${read("app/workspace/frame-controller.js")}`;
  const protocol = await dataModule(read("shared/protocol.js"));

  assert.deepEqual(bridge.GROK_SESSION_COOKIE_NAMES, ["sso", "sso-rw", "grok_device_id"]);
  assert.equal(bridge.isGrokSessionUrl("https://grok.com/c/123"), true);
  assert.equal(bridge.isGrokSessionUrl("https://grok.x.ai/"), false);
  assert.equal(bridge.isGrokSessionUrl("http://grok.com/"), false);
  assert.equal(bridge.isGrokSessionUrl("https://grok.com.evil.example/"), false);
  assert.deepEqual(
    bridge.chromiumExtensionPartitionKey({ getURL: () => `${EXTENSION_SITE}/` }),
    { topLevelSite: EXTENSION_SITE, hasCrossSiteAncestor: true }
  );
  assert.equal(bridge.chromiumExtensionPartitionKey({ getURL: () => "moz-extension://example/" }), null);

  const secrets = {
    sso: "SENTINEL_SSO_VALUE",
    "sso-rw": "SENTINEL_SSO_RW_VALUE",
    grok_device_id: "SENTINEL_DEVICE_VALUE"
  };
  const api = fakeExtensionApi([
    sourceCookie("sso", secrets.sso),
    sourceCookie("sso-rw", secrets["sso-rw"], { hostOnly: true, domain: "grok.com" }),
    sourceCookie("grok_device_id", secrets.grok_device_id)
  ]);
  const partitionKey = { topLevelSite: EXTENSION_SITE, hasCrossSiteAncestor: true };

  assert.equal(await bridge.cookieStoreIdForTab(api, 7), "0");
  assert.equal(await bridge.cookieStoreIdForTab(api, 9), "1");
  await assert.rejects(() => bridge.cookieStoreIdForTab(api, 99), /Cookie store/);

  const first = await bridge.syncGrokSessionCookies(api, { storeId: "0", partitionKey });
  assert.deepEqual(first, { changed: true, created: 3, updated: 0, removed: 0, skipped: 0 });
  assert.equal(api.setCalls.length, 3);
  for (const call of api.setCalls) {
    assert.deepEqual(call.partitionKey, partitionKey);
    assert.equal(call.sameSite, "no_restriction");
    assert.equal(call.secure, true);
    assert.equal(call.storeId, "0");
  }
  assert.equal(api.setCalls.find((call) => call.name === "grok_device_id").httpOnly, true);
  assert.equal(api.setCalls.find((call) => call.name === "grok_device_id").expirationDate, 2000000000);
  assert.equal("expirationDate" in api.setCalls.find((call) => call.name === "sso"), false);
  assert.equal("domain" in api.setCalls.find((call) => call.name === "sso-rw"), false);
  assert.equal(api.sourceByName.get("sso").sameSite, "lax", "source Cookie must remain untouched");
  assert.equal(api.sourceByName.get("sso-rw").sameSite, "strict", "source Cookie must remain untouched");
  assert.equal(Object.values(secrets).some((secret) => JSON.stringify(first).includes(secret)), false);
  assert.equal(Object.values(secrets).some((secret) => JSON.stringify(api.stored).includes(secret)), false);

  const second = await bridge.syncGrokSessionCookies(api, { storeId: "0", partitionKey });
  assert.deepEqual(second, { changed: false, created: 0, updated: 0, removed: 0, skipped: 0 });
  assert.equal(api.setCalls.length, 3, "idempotent sync must not write again");

  api.sourceByName.delete("sso-rw");
  const removed = await bridge.syncGrokSessionCookies(api, { storeId: "0", partitionKey });
  assert.equal(removed.removed, 1);
  assert.equal(api.removeCalls.length, 1);
  assert.equal(api.sourceByName.has("sso"), true, "source Cookie must never be deleted");

  const unmanaged = fakeExtensionApi([sourceCookie("sso", "SOURCE")]);
  unmanaged.targets.set(partitionId({ name: "sso", storeId: "0", partitionKey }), {
    ...sourceCookie("sso", "SITE_OWNED", { storeId: "0" }),
    sameSite: "no_restriction",
    partitionKey
  });
  const skipped = await bridge.syncGrokSessionCookies(unmanaged, { storeId: "0", partitionKey });
  assert.equal(skipped.skipped, 1);
  assert.equal(unmanaged.setCalls.length, 0, "an existing site-owned partition must not be overwritten");

  const adoptable = fakeExtensionApi([sourceCookie("sso", "MATCHING")]);
  adoptable.targets.set(partitionId({ name: "sso", storeId: "0", partitionKey }), {
    ...sourceCookie("sso", "MATCHING", { storeId: "0" }),
    sameSite: "no_restriction",
    partitionKey
  });
  const adopted = await bridge.syncGrokSessionCookies(adoptable, { storeId: "0", partitionKey, names: ["sso"] });
  assert.deepEqual(adopted, { changed: false, created: 0, updated: 0, removed: 0, skipped: 0 });
  adoptable.sourceByName.set("sso", sourceCookie("sso", "ROTATED"));
  assert.equal(
    (await bridge.syncGrokSessionCookies(adoptable, { storeId: "0", partitionKey, names: ["sso"] })).updated,
    1,
    "an exact existing mirror must be adopted and follow later source rotation"
  );

  const wrongKey = { topLevelSite: EXTENSION_SITE };
  const cleanup = fakeExtensionApi([sourceCookie("sso", "CLEANUP")]);
  await bridge.syncGrokSessionCookies(cleanup, { storeId: "0", partitionKey: wrongKey, names: ["sso"] });
  const cleaned = await bridge.removeManagedGrokPartitionsExcept(cleanup, { storeId: "0", partitionKey });
  assert.deepEqual(cleaned, { changed: true, removed: 1 });
  assert.equal(cleanup.targets.size, 0);

  const partial = fakeExtensionApi([
    sourceCookie("sso", "PARTIAL_ONE"),
    sourceCookie("sso-rw", "PARTIAL_TWO"),
    sourceCookie("grok_device_id", "PARTIAL_THREE")
  ]);
  const normalSet = partial.cookies.set.bind(partial.cookies);
  partial.cookies.set = async (details) => {
    if (details.name === "sso-rw") throw new Error("simulated Cookie write failure");
    return normalSet(details);
  };
  await assert.rejects(
    () => bridge.syncGrokSessionCookies(partial, { storeId: "0", partitionKey }),
    /simulated Cookie write failure/
  );
  partial.cookies.set = normalSet;
  const recovered = await bridge.syncGrokSessionCookies(partial, { storeId: "0", partitionKey });
  assert.equal(recovered.created, 2, "a partial write must remain managed and recover on retry");
  assert.equal(partial.targets.size, 3);
  const cleared = await bridge.removeAllManagedGrokPartitions(partial);
  assert.deepEqual(cleared, { changed: true, removed: 3 });
  assert.equal(partial.targets.size, 0);
  assert.equal(partial.stored[bridge.GROK_COOKIE_LEDGER_KEY], undefined);

  const explicitSso = await releaseManagedCookie(bridge, { name: "sso", cause: "explicit", value: "ROTATE" });
  assert.equal(bridge.isPartitionedGrokTargetChange({ removed: true, cause: "explicit", cookie: explicitSso.cookie }), true);
  assert.deepEqual(explicitSso.released, { changed: true, tombstoned: true });
  const afterLogout = await bridge.syncGrokSessionCookies(explicitSso.api, { storeId: "0", partitionKey, names: ["sso"] });
  assert.equal(afterLogout.skipped, 1, "managed explicit sso removal must prevent immediate mirror recreation");
  assert.equal(await bridge.clearGrokTombstonesForStore(explicitSso.api, "0", ["grok_device_id"]), false);
  assert.equal((await bridge.syncGrokSessionCookies(explicitSso.api, { storeId: "0", partitionKey, names: ["sso"] })).skipped, 1);
  assert.equal(await bridge.clearGrokTombstonesForStore(explicitSso.api, "0", ["sso"]), true);
  assert.equal((await bridge.syncGrokSessionCookies(explicitSso.api, { storeId: "0", partitionKey, names: ["sso"] })).created, 1);

  const positiveTombstones = [
    await releaseManagedCookie(bridge, { name: "sso", cause: "expired_overwrite" }),
    await releaseManagedCookie(bridge, { name: "sso-rw", cause: "explicit" }),
    await releaseManagedCookie(bridge, { name: "sso-rw", cause: "expired_overwrite", value: "EXPIRED_LOGOUT" })
  ];
  for (const result of positiveTombstones) {
    assert.deepEqual(result.released, { changed: true, tombstoned: true });
  }

  const deviceRemoval = await releaseManagedCookie(bridge, { name: "grok_device_id", cause: "explicit" });
  assert.deepEqual(deviceRemoval.released, { changed: true, tombstoned: false });
  assert.equal(
    (await bridge.syncGrokSessionCookies(deviceRemoval.api, { storeId: "0", partitionKey, names: ["grok_device_id"] })).created,
    1,
    "grok_device_id removal must not create an authentication tombstone"
  );

  const unrelatedCause = await releaseManagedCookie(bridge, { name: "sso", cause: "expired" });
  assert.deepEqual(unrelatedCause.released, { changed: true, tombstoned: false });
  assert.equal(
    (await bridge.syncGrokSessionCookies(unrelatedCause.api, { storeId: "0", partitionKey, names: ["sso"] })).created,
    1,
    "non-logout removal causes must not tombstone sso"
  );

  const unmanagedRemovalApi = fakeExtensionApi([sourceCookie("sso", "UNMANAGED_SOURCE")]);
  const unmanagedCookie = {
    ...sourceCookie("sso", "UNMANAGED_TARGET", { storeId: "0" }),
    sameSite: "no_restriction",
    partitionKey
  };
  unmanagedRemovalApi.targets.set(partitionId({ name: "sso", storeId: "0", partitionKey }), unmanagedCookie);
  unmanagedRemovalApi.targets.delete(partitionId({ name: "sso", storeId: "0", partitionKey }));
  assert.deepEqual(
    await bridge.releaseChangedGrokPartition(unmanagedRemovalApi, {
      removed: true,
      cause: "explicit",
      cookie: unmanagedCookie
    }),
    { changed: false, tombstoned: false },
    "an unmanaged partition must never acquire a logout tombstone"
  );

  assert.equal(bridge.isUnpartitionedGrokSourceChange({ cookie: sourceCookie("sso", "x") }), true);
  assert.equal(bridge.isUnpartitionedGrokSourceChange({ cookie: sourceCookie("cf_clearance", "x") }), false);
  assert.equal(manifest.permissions.includes("cookies"), true);
  assert.match(serviceWorker, /extensionPageSender\(sender\)/);
  assert.match(serviceWorker, /api\.cookies\.getPartitionKey\(\{/);
  assert.match(serviceWorker, /frame\.parentFrameId !== 0/);
  assert.match(serviceWorker, /isGrokSessionUrl\(senderUrl\)/);
  assert.match(serviceWorker, /removeAllManagedGrokPartitions\(api\)/);
  assert.match(serviceWorker, /markFramePreflightFallback/);
  assert.match(serviceWorker, /consumeFallbackReload/);
  const sourceSync = grokRuntime.slice(
    grokRuntime.indexOf("function scheduleSourceCookieSync"),
    grokRuntime.indexOf("function handleCookieChange")
  );
  assert.match(sourceSync, /managedGrokPartitionKeys/);
  assert.doesNotMatch(sourceSync, /chromiumExtensionPartitionKey/);
  assert.doesNotMatch(serviceWorker, /message\.(?:partitionKey|topLevelSite|storeId|names)/);
  assert.match(relay, /window\.top === window/);
  assert.match(relay, /globalThis\[INSTALLATION_KEY\] === `\$\{INSTALLATION_VERSION\}:pending`/);
  assert.match(relay, /delete globalThis\[INSTALLATION_KEY\]/);
  assert.match(relay, /sessionStorage\.setItem\(RELOAD_MARKER/);
  assert.equal(relay.match(/var GROK_COOKIE_BRIDGE_VERSION = "([^"]+)"/)?.[1], protocol.GROK_COOKIE_BRIDGE_VERSION);
  assert.match(read("content-src/grok-cookie-bridge.js"), /const BRIDGE_VERSION = GROK_COOKIE_BRIDGE_VERSION/);
  assert.match(read("content-src/grok-cookie-bridge.js"), /const INSTALLATION_VERSION = runtimeIdentity\.bundle\.implementationVersion/);
  assert.match(workspace, /grokPreflight \? 10000 : 1800/);
  assert.match(workspace, /markGrokFramePreflightFallback\(url, preflightId\)/);

  console.log("Grok partitioned Cookie bridge: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
