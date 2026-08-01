#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

(async () => {
  const root = path.resolve(__dirname, "..");
  const vector = JSON.parse(fs.readFileSync(path.join(__dirname, "official-rules-signature-vector.json"), "utf8"));
  const runtime = await import("../background/official-rules-channel.js");
  const rawBytes = Buffer.from(vector.raw, "base64url");
  const expectedInput = Buffer.from(vector.signingInput, "base64url");
  assert.deepEqual(Buffer.from(runtime.officialRulesSignatureInput(vector.kind, rawBytes)), expectedInput);
  const keyring = {
    [vector.signature.keyId]: {
      algorithm: vector.signature.algorithm,
      publicKey: vector.publicJwk
    }
  };
  await assert.rejects(
    runtime.verifyOfficialRulesDocument({
      kind: vector.kind,
      rawBytes,
      signatureText: JSON.stringify(vector.signature),
      keyring,
      crypto: globalThis.crypto
    }),
    (error) => error?.code === "INVALID_OFFICIAL_RULES_COMPONENT",
    "the fixed signature must verify before the intentionally minimal vector payload is schema-checked"
  );
  const tampered = Buffer.from(rawBytes);
  tampered[tampered.length - 1] ^= 1;
  await assert.rejects(
    runtime.verifyOfficialRulesDocument({
      kind: vector.kind,
      rawBytes: tampered,
      signatureText: JSON.stringify(vector.signature),
      keyring,
      crypto: globalThis.crypto
    }),
    (error) => error?.code === "INVALID_SIGNATURE"
  );
  assert.equal(fs.existsSync(path.join(root, "background/official-rules-channel.js")), true);
  console.log("Official rules fixed P-256 P1363 signing vector passed.");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
