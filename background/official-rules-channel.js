import {
  OFFICIAL_RULES_LIMITS,
  normalizeOfficialRulesCatalog,
  normalizeOfficialRulesChannel,
  normalizeOfficialRulesComponent
} from "../shared/official-rules-contract.js";

const OFFICIAL_RULES_SIGNATURE_SCHEMA_VERSION = 1;
const OFFICIAL_RULES_SIGNATURE_ALGORITHM = "ECDSA-P256-SHA256";
export const OFFICIAL_RULES_SIGNATURE_DOMAINS = Object.freeze({
  channel: "ChatClubOfficialRules/channel/v1",
  catalog: "ChatClubOfficialRules/catalog/v1",
  component: "ChatClubOfficialRules/component/v1"
});

export const OFFICIAL_RULES_PINNED_KEYS = Object.freeze({
  "chatclub-rules-current-2026-08": Object.freeze({
    algorithm: OFFICIAL_RULES_SIGNATURE_ALGORITHM,
    fingerprintSha256: "a24a0e6a9debc100ff4bf3ad273b84c541d1caaf95c525b604b08ed0d0b84d7a",
    publicKey: Object.freeze({
      kty: "EC",
      x: "v3bNQSKNe6Tk7adsoawJ1cLHyanMMaUaZBEIF9uCPFc",
      y: "Dt6Yvoqe1VkI_Nv1f-axsaEOVTb4L1K_sU9c19sIaFc",
      crv: "P-256"
    })
  }),
  "chatclub-rules-recovery-2026-08": Object.freeze({
    algorithm: OFFICIAL_RULES_SIGNATURE_ALGORITHM,
    fingerprintSha256: "6dfeb6c47f2d3e1dda612cd2b9ac09006ebc062c710471493b970c19344529c9",
    publicKey: Object.freeze({
      kty: "EC",
      x: "AhhHgiYQJ1NezS7_jBaCvOAnp7l8cnNCpkRl1Zo1QEQ",
      y: "Bpxye7AK9ZKT1VDTvB5RN5F1hCQj25mBGnHHwbaSUCs",
      crv: "P-256"
    })
  })
});

const SIGNATURE_KEYS = new Set(["schemaVersion", "keyId", "algorithm", "signature"]);
const SHA256_HEX = /^[a-f0-9]{64}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const textEncoder = new TextEncoder();

export class OfficialRulesError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "OfficialRulesError";
    this.code = String(code || "OFFICIAL_RULES_ERROR");
    this.details = details && typeof details === "object" ? details : {};
  }
}

function fail(code, message, details = {}) {
  throw new OfficialRulesError(code, message, details);
}

function plainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, allowed, label) {
  if (!plainObject(value)) fail("INVALID_SIGNATURE_DOCUMENT", `${label} must be an object`);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  const missing = [...allowed].filter((key) => !Object.hasOwn(value, key));
  if (unknown.length || missing.length) {
    fail("INVALID_SIGNATURE_DOCUMENT", `${label} fields are invalid`, { unknown, missing });
  }
}

function normalizedHash(value, label) {
  const hash = String(value || "").trim().toLowerCase();
  if (!SHA256_HEX.test(hash)) fail("INVALID_HASH", `${label} must be a SHA-256 hex digest`);
  return hash;
}

function requiredText(value, label, maximum = 512) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || text.length > maximum) fail("INVALID_SIGNATURE_DOCUMENT", `${label} is invalid`);
  return text;
}

function base64UrlToBytes(value, label = "base64url value") {
  const source = String(value || "").trim();
  if (!source || !BASE64URL.test(source)) fail("INVALID_ENCODING", `${label} is not base64url`);
  const standard = source.replace(/-/g, "+").replace(/_/g, "/");
  const padded = standard + "=".repeat((4 - (standard.length % 4)) % 4);
  try {
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const canonical = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
    if (canonical !== source) fail("INVALID_ENCODING", `${label} is not canonical unpadded base64url`);
    return bytes;
  } catch {
    fail("INVALID_ENCODING", `${label} is not base64url`);
  }
}

function bytesToHex(bytes) {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(value, cryptoApi = globalThis.crypto) {
  if (!cryptoApi?.subtle?.digest) fail("CRYPTO_UNAVAILABLE", "Web Crypto SHA-256 is unavailable");
  const bytes = value instanceof Uint8Array ? value : textEncoder.encode(String(value));
  return bytesToHex(new Uint8Array(await cryptoApi.subtle.digest("SHA-256", bytes)));
}

function normalizeOfficialRulesSignature(raw) {
  let value;
  if (typeof raw === "string") {
    if (textEncoder.encode(raw).byteLength > OFFICIAL_RULES_LIMITS.signatureBytes) {
      fail("SIGNATURE_TOO_LARGE", `Official-rules signature exceeds ${OFFICIAL_RULES_LIMITS.signatureBytes} bytes`);
    }
    try { value = JSON.parse(raw); }
    catch { fail("INVALID_SIGNATURE_DOCUMENT", "Official-rules signature is not valid JSON"); }
  } else {
    value = raw;
  }
  exactKeys(value, SIGNATURE_KEYS, "official-rules signature");
  if (value.schemaVersion !== OFFICIAL_RULES_SIGNATURE_SCHEMA_VERSION) {
    fail("UNSUPPORTED_SIGNATURE_SCHEMA", `Official-rules signature schema must equal ${OFFICIAL_RULES_SIGNATURE_SCHEMA_VERSION}`);
  }
  if (value.algorithm !== OFFICIAL_RULES_SIGNATURE_ALGORITHM) {
    fail("UNSUPPORTED_SIGNATURE", `Official-rules signature algorithm must equal ${OFFICIAL_RULES_SIGNATURE_ALGORITHM}`);
  }
  const signature = requiredText(value.signature, "signature", 86);
  const signatureBytes = base64UrlToBytes(signature, "signature");
  if (signatureBytes.byteLength !== 64) fail("INVALID_SIGNATURE", "Official-rules signature must be a 64-byte IEEE-P1363 value");
  return Object.freeze({
    schemaVersion: OFFICIAL_RULES_SIGNATURE_SCHEMA_VERSION,
    keyId: requiredText(value.keyId, "keyId", 64),
    algorithm: OFFICIAL_RULES_SIGNATURE_ALGORITHM,
    signature,
    signatureBytes
  });
}

function keyringEntry(keyring, keyId) {
  if (keyring instanceof Map) return keyring.get(keyId);
  return plainObject(keyring) ? keyring[keyId] : null;
}

async function importVerificationKey(entry, cryptoApi) {
  const source = entry?.key ?? entry?.publicKey ?? entry;
  if (!source) fail("UNKNOWN_SIGNING_KEY", "Official-rules signing key is unavailable");
  if (entry?.algorithm && entry.algorithm !== OFFICIAL_RULES_SIGNATURE_ALGORITHM) {
    fail("SIGNATURE_ALGORITHM_MISMATCH", "Official-rules signing key algorithm is incompatible");
  }
  if (typeof CryptoKey !== "undefined" && source instanceof CryptoKey) return source;
  if (source?.type === "public" && source?.algorithm) return source;
  const algorithm = { name: "ECDSA", namedCurve: "P-256" };
  try {
    if (plainObject(source)) return cryptoApi.subtle.importKey("jwk", source, algorithm, false, ["verify"]);
    const bytes = source instanceof Uint8Array ? source : base64UrlToBytes(source, "public key");
    return cryptoApi.subtle.importKey("spki", bytes, algorithm, false, ["verify"]);
  } catch (error) {
    if (error instanceof OfficialRulesError) throw error;
    fail("INVALID_SIGNING_KEY", `Official-rules signing key could not be imported: ${error?.message || String(error)}`);
  }
}

export function officialRulesSignatureInput(kind, rawBytes) {
  const domain = OFFICIAL_RULES_SIGNATURE_DOMAINS[kind];
  if (!domain) fail("INVALID_DOCUMENT_KIND", `Unknown official-rules document kind: ${kind}`);
  const payload = rawBytes instanceof Uint8Array ? rawBytes : textEncoder.encode(String(rawBytes));
  const prefix = textEncoder.encode(domain);
  const input = new Uint8Array(prefix.byteLength + 1 + payload.byteLength);
  input.set(prefix, 0);
  input[prefix.byteLength] = 0;
  input.set(payload, prefix.byteLength + 1);
  return input;
}

function normalizePayload(kind, rawText) {
  try {
    if (kind === "channel") return normalizeOfficialRulesChannel(rawText);
    if (kind === "catalog") return normalizeOfficialRulesCatalog(rawText);
    if (kind === "component") return normalizeOfficialRulesComponent(rawText);
  } catch (error) {
    fail(error?.code || "INVALID_DOCUMENT", error?.message || `Invalid official-rules ${kind}`, { errors: error?.errors || [] });
  }
  fail("INVALID_DOCUMENT_KIND", `Unknown official-rules document kind: ${kind}`);
}

export async function verifyOfficialRulesDocument(options = {}) {
  const kind = String(options.kind || "");
  const rawBytes = options.rawBytes instanceof Uint8Array
    ? options.rawBytes
    : textEncoder.encode(String(options.rawText ?? ""));
  let rawText;
  try { rawText = new TextDecoder("utf-8", { fatal: true }).decode(rawBytes); }
  catch { fail("INVALID_ENCODING", `Official-rules ${kind} is not valid UTF-8`); }
  const cryptoApi = options.crypto || globalThis.crypto;
  if (!cryptoApi?.subtle?.verify) fail("CRYPTO_UNAVAILABLE", "Web Crypto ECDSA verification is unavailable");
  const signature = normalizeOfficialRulesSignature(options.signatureText ?? options.signature);
  if (options.expectedKeyId && signature.keyId !== String(options.expectedKeyId)) {
    fail("SIGNING_KEY_MISMATCH", `Expected signing key ${options.expectedKeyId}, received ${signature.keyId}`);
  }
  const entry = keyringEntry(options.keyring || OFFICIAL_RULES_PINNED_KEYS, signature.keyId);
  if (!entry) fail("UNKNOWN_SIGNING_KEY", `Unknown official-rules signing key: ${signature.keyId}`);
  const publicKey = await importVerificationKey(entry, cryptoApi);
  let valid = false;
  try {
    valid = await cryptoApi.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      publicKey,
      signature.signatureBytes,
      officialRulesSignatureInput(kind, rawBytes)
    );
  } catch (error) {
    fail("SIGNATURE_CHECK_FAILED", `Official-rules signature verification failed: ${error?.message || String(error)}`);
  }
  if (!valid) fail("INVALID_SIGNATURE", `Official-rules ${kind} signature is invalid`);
  const rawHash = await sha256Hex(rawBytes, cryptoApi);
  if (options.expectedHash && rawHash !== normalizedHash(options.expectedHash, "expected hash")) {
    fail("HASH_MISMATCH", `Expected official-rules hash ${options.expectedHash}, received ${rawHash}`);
  }
  if (options.expectedSize !== undefined && rawBytes.byteLength !== Number(options.expectedSize)) {
    fail("SIZE_MISMATCH", `Expected official-rules size ${options.expectedSize}, received ${rawBytes.byteLength}`);
  }
  return Object.freeze({
    kind,
    keyId: signature.keyId,
    rawHash,
    rawSize: rawBytes.byteLength,
    rawText,
    signatureText: typeof options.signatureText === "string" ? options.signatureText : JSON.stringify(options.signature),
    value: normalizePayload(kind, rawText)
  });
}

async function responseBytes(response, maximumBytes) {
  const declared = Number(response.headers?.get?.("content-length"));
  if (Number.isFinite(declared) && declared > maximumBytes) fail("DOCUMENT_TOO_LARGE", `Official-rules response exceeds ${maximumBytes} bytes`);
  if (response.body?.getReader) {
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel().catch(() => {});
        fail("DOCUMENT_TOO_LARGE", `Official-rules response exceeds ${maximumBytes} bytes`);
      }
      chunks.push(value);
    }
    const output = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      output.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return output;
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > maximumBytes) fail("DOCUMENT_TOO_LARGE", `Official-rules response exceeds ${maximumBytes} bytes`);
  return bytes;
}

async function fetchBytes(url, options = {}) {
  const fetchFn = options.fetch || globalThis.fetch;
  if (typeof fetchFn !== "function") fail("FETCH_UNAVAILABLE", "Official-rules fetch is unavailable");
  if (typeof options.allowUrl !== "function" || options.allowUrl(url, options.role) !== true) {
    fail("URL_NOT_ALLOWED", `Official-rules URL is not allowed: ${url}`);
  }
  const controller = new AbortController();
  const timeoutMs = Math.max(1000, Math.min(30_000, Number(options.timeoutMs) || 15_000));
  const timeout = setTimeout(() => controller.abort(new DOMException("Official-rules request timed out", "TimeoutError")), timeoutMs);
  const abort = () => controller.abort(options.signal?.reason);
  options.signal?.addEventListener?.("abort", abort, { once: true });
  const headers = { Accept: options.accept || "application/json" };
  if (options.ifNoneMatch) headers["If-None-Match"] = String(options.ifNoneMatch);
  try {
    const response = await fetchFn(url, {
      method: "GET",
      headers,
      cache: "no-cache",
      credentials: "omit",
      redirect: "follow",
      referrerPolicy: "no-referrer",
      signal: controller.signal
    });
    const finalUrl = String(response.url || url);
    const finalAllowed = typeof options.allowFinalUrl === "function"
      ? options.allowFinalUrl(finalUrl, options.role, url) === true
      : finalUrl === url;
    if (!finalAllowed) {
      fail("REDIRECT_URL_NOT_ALLOWED", `Official-rules response URL is not allowed: ${finalUrl}`);
    }
    const etag = String(response.headers?.get?.("etag") || "");
    if (response.status === 304) return { notModified: true, etag, bytes: null };
    if (!response.ok) {
      const retryAfter = String(response.headers?.get?.("retry-after") || "").trim();
      fail("HTTP_ERROR", `Official-rules request failed with HTTP ${response.status}`, { status: response.status, retryAfter });
    }
    return {
      notModified: false,
      etag,
      bytes: await responseBytes(response, options.maximumBytes)
    };
  } catch (error) {
    if (error instanceof OfficialRulesError) throw error;
    fail(controller.signal.aborted ? "FETCH_ABORTED" : "FETCH_FAILED", `Official-rules request failed: ${error?.message || String(error)}`);
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener?.("abort", abort);
  }
}

export async function fetchVerifiedOfficialRulesDocument(options = {}) {
  const limits = {
    channel: OFFICIAL_RULES_LIMITS.channelBytes,
    catalog: OFFICIAL_RULES_LIMITS.catalogBytes,
    component: OFFICIAL_RULES_LIMITS.componentBytes
  };
  const maximumBytes = limits[options.kind];
  if (!maximumBytes) fail("INVALID_DOCUMENT_KIND", `Unknown official-rules document kind: ${options.kind}`);
  const payload = await fetchBytes(options.url, {
    ...options,
    role: `${options.kind}-payload`,
    maximumBytes,
    accept: "application/json"
  });
  if (payload.notModified) return Object.freeze({ notModified: true, etag: payload.etag });
  const signature = await fetchBytes(options.signatureUrl, {
    ...options,
    role: `${options.kind}-signature`,
    maximumBytes: OFFICIAL_RULES_LIMITS.signatureBytes,
    accept: "application/json",
    ifNoneMatch: ""
  });
  if (signature.notModified || !signature.bytes) fail("SIGNATURE_MISSING", "Official-rules detached signature response is missing");
  let signatureText;
  try { signatureText = new TextDecoder("utf-8", { fatal: true }).decode(signature.bytes); }
  catch { fail("INVALID_ENCODING", "Official-rules detached signature is not valid UTF-8"); }
  const verified = await verifyOfficialRulesDocument({
    ...options,
    rawBytes: payload.bytes,
    signatureText
  });
  return Object.freeze({ notModified: false, etag: payload.etag, document: verified });
}
