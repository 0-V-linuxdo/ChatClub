#!/usr/bin/env node

const assert = require("node:assert/strict");

(async () => {
  const baseline = await import("../shared/official-rules-baseline.js");
  const contract = await import("../shared/official-rules-contract.js");
  const channelRuntime = await import("../background/official-rules-channel.js");
  const {
    OFFICIAL_RULES_PINNED_KEYS,
    OFFICIAL_RULES_SIGNATURE_DOMAINS,
    fetchVerifiedOfficialRulesDocument,
    officialRulesSignatureInput,
    sha256Hex,
    verifyOfficialRulesDocument
  } = channelRuntime;
  const { OFFICIAL_RULES_SELECTOR_SLOTS } = contract;
  const OFFICIAL_RULES_RELEASE_PREFIX = "https://github.com/0-V-linuxdo/ChatClub-rules/releases/download/";
  const { findOfficialRulesBaselineComponent } = baseline;
  const officialRulesTrustRoots = (feature, siteId) => (
    findOfficialRulesBaselineComponent(feature, siteId)?.trustRoots || []
  );
  const cryptoApi = globalThis.crypto;
  const keyPair = await cryptoApi.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const keyId = "test-p256-key";
  const keyring = { [keyId]: { algorithm: "ECDSA-P256-SHA256", publicKey: keyPair.publicKey } };
  const encode = (value) => new TextEncoder().encode(value);
  const b64url = (bytes) => Buffer.from(bytes).toString("base64url");
  const signatureText = async (kind, rawText) => {
    const signature = new Uint8Array(await cryptoApi.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      keyPair.privateKey,
      officialRulesSignatureInput(kind, encode(rawText))
    ));
    assert.equal(signature.byteLength, 64, "tests require IEEE-P1363 Web Crypto ECDSA signatures");
    return JSON.stringify({ schemaVersion: 1, keyId, algorithm: "ECDSA-P256-SHA256", signature: b64url(signature) });
  };
  const component = {
    schemaVersion: 1,
    rulesApiVersion: 1,
    feature: "summary",
    siteId: "chatgpt",
    revision: 7,
    status: "active",
    hosts: [officialRulesTrustRoots("summary", "chatgpt")[0]],
    pathPrefixes: [],
    selectors: Object.fromEntries(OFFICIAL_RULES_SELECTOR_SLOTS.summary.map((slot) => [slot,
      slot === "messageRoot" ? ["article[data-message]"]
        : slot === "userRoot" ? ["article[data-role='user']"]
          : slot === "assistantRoot" ? ["article[data-role='assistant']"] : []
    ])),
    parameters: { waitMs: 900 }
  };
  const rawText = JSON.stringify(component);
  const detachedSignature = await signatureText("component", rawText);
  const hash = await sha256Hex(encode(rawText), cryptoApi);

  assert.equal(OFFICIAL_RULES_SIGNATURE_DOMAINS.channel, "ChatClubOfficialRules/channel/v1");
  assert.equal(OFFICIAL_RULES_SIGNATURE_DOMAINS.catalog, "ChatClubOfficialRules/catalog/v1");
  assert.equal(OFFICIAL_RULES_SIGNATURE_DOMAINS.component, "ChatClubOfficialRules/component/v1");
  assert.deepEqual(
    [...officialRulesSignatureInput("channel", Uint8Array.of(1, 2)).slice(-3)],
    [0, 1, 2],
    "signature domain and raw bytes must be separated by exactly one NUL"
  );
  assert.deepEqual(Object.keys(OFFICIAL_RULES_PINNED_KEYS).sort(), [
    "chatclub-rules-current-2026-08",
    "chatclub-rules-recovery-2026-08"
  ]);
  assert.equal(OFFICIAL_RULES_PINNED_KEYS["chatclub-rules-current-2026-08"].fingerprintSha256, "a24a0e6a9debc100ff4bf3ad273b84c541d1caaf95c525b604b08ed0d0b84d7a");
  assert.equal(OFFICIAL_RULES_PINNED_KEYS["chatclub-rules-recovery-2026-08"].fingerprintSha256, "6dfeb6c47f2d3e1dda612cd2b9ac09006ebc062c710471493b970c19344529c9");

  const verified = await verifyOfficialRulesDocument({
    kind: "component",
    rawText,
    signatureText: detachedSignature,
    keyring,
    crypto: cryptoApi,
    expectedHash: hash,
    expectedSize: encode(rawText).byteLength,
    expectedKeyId: keyId
  });
  assert.equal(verified.value.siteId, "chatgpt");
  assert.equal(verified.rawHash, hash);
  await assert.rejects(
    verifyOfficialRulesDocument({ kind: "component", rawText: `${rawText} `, signatureText: detachedSignature, keyring, crypto: cryptoApi }),
    (error) => error?.code === "INVALID_SIGNATURE"
  );
  await assert.rejects(
    verifyOfficialRulesDocument({ kind: "component", rawText, signatureText: detachedSignature, keyring, crypto: cryptoApi, expectedKeyId: "other-key" }),
    (error) => error?.code === "SIGNING_KEY_MISMATCH"
  );

  const payloadUrl = `${OFFICIAL_RULES_RELEASE_PREFIX}rules-v7/summary-chatgpt.json`;
  const signatureUrl = `${payloadUrl}.sig.json`;
  const responses = new Map([
    [payloadUrl, new Response(rawText, { status: 200, headers: { ETag: "payload-v7" } })],
    [signatureUrl, new Response(detachedSignature, { status: 200 })]
  ]);
  const calls = [];
  const fetched = await fetchVerifiedOfficialRulesDocument({
    kind: "component",
    url: payloadUrl,
    signatureUrl,
    expectedHash: hash,
    expectedSize: encode(rawText).byteLength,
    expectedKeyId: keyId,
    keyring,
    crypto: cryptoApi,
    fetch: async (url, request) => {
      calls.push({ url, request });
      const response = responses.get(url);
      if (!response) return new Response("missing", { status: 404 });
      return response.clone();
    },
    allowUrl: (url) => responses.has(url)
  });
  assert.equal(fetched.document.value.revision, 7);
  assert.deepEqual(calls.map(({ url }) => url), [payloadUrl, signatureUrl]);
  assert.ok(calls.every(({ request }) => request.credentials === "omit" && request.referrerPolicy === "no-referrer"));

  const malformedSignature = JSON.stringify({
    schemaVersion: 1,
    keyId,
    algorithm: "ECDSA-P256-SHA256",
    signature: b64url(new Uint8Array(63))
  });
  await assert.rejects(
    verifyOfficialRulesDocument({ kind: "component", rawText, signatureText: malformedSignature, keyring, crypto: cryptoApi }),
    (error) => error?.code === "INVALID_SIGNATURE"
  );

  const futureChannel = {
    schemaVersion: 1,
    channel: "stable",
    sequence: 8,
    rulesVersion: "2026.08.01.8",
    rulesApiVersion: 2,
    minExtensionVersion: "2026.8.1.1",
    publishedAt: "2026-08-01T08:00:00Z",
    catalog: {
      url: `${OFFICIAL_RULES_RELEASE_PREFIX}rules-v8/catalog.json`,
      signatureUrl: `${OFFICIAL_RULES_RELEASE_PREFIX}rules-v8/catalog.json.sig.json`,
      size: 1024,
      sha256: "b".repeat(64),
      keyId
    }
  };
  const futureChannelRaw = JSON.stringify(futureChannel);
  const verifiedFutureChannel = await verifyOfficialRulesDocument({
    kind: "channel",
    rawText: futureChannelRaw,
    signatureText: await signatureText("channel", futureChannelRaw),
    keyring,
    crypto: cryptoApi
  });
  assert.equal(verifiedFutureChannel.value.schemaVersion, 1);
  assert.equal(verifiedFutureChannel.value.rulesApiVersion, 2);

  console.log("Official rules detached signature and raw document verification tests passed.");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
