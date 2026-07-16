export const DELETE_COMPLETION_STATE_VERSION = 1;

const MAX_IDENTITY_ID_LENGTH = 512;

function hostMatches(host, roots = []) {
  return roots.some((root) => host === root || host.endsWith(`.${root}`));
}

function cleanIdentityId(value) {
  const raw = String(value || "").trim();
  if (!raw || raw.length > MAX_IDENTITY_ID_LENGTH) return "";
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function identity(provider, value) {
  const id = cleanIdentityId(value);
  return id ? Object.freeze({ provider, id }) : null;
}

export function normalizeDeleteConversationIdentity(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const provider = String(value.provider || "").trim();
  if (!/^(?:chatgpt|gemini|kagi|notion|grok|deepseek)$/.test(provider)) return null;
  return identity(provider, value.id);
}

export function normalizeDeleteFrameHref(value) {
  try {
    const url = new URL(String(value || ""));
    return /^https?:$/.test(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

export function deleteConversationIdentityFromHref(value, baseHref = undefined) {
  let url;
  try {
    url = baseHref ? new URL(String(value || ""), String(baseHref)) : new URL(String(value || ""));
  } catch {
    return null;
  }
  if (!/^https?:$/.test(url.protocol)) return null;
  const host = url.hostname.toLowerCase();
  const path = url.pathname || "/";
  let match = null;

  if (hostMatches(host, ["chatgpt.com", "chat.openai.com"])) {
    match = /\/(?:g\/[^/?#]+\/)?c\/([^/?#]+)/i.exec(path);
    return match ? identity("chatgpt", match[1]) : null;
  }
  if (hostMatches(host, ["gemini.google.com", "bard.google.com"])) {
    match = /^\/app\/([^/?#]+)/i.exec(path);
    return match ? identity("gemini", match[1]) : null;
  }
  if (host === "assistant.kagi.com") {
    match = /^\/chat\/([^/?#]+)/i.exec(path);
    return match ? identity("kagi", match[1]) : null;
  }
  if (hostMatches(host, ["app.notion.com", "notion.so"]) && /^\/chat\/?$/i.test(path)) {
    return identity("notion", url.searchParams.get("t"));
  }
  if (hostMatches(host, ["grok.com", "grok.x.ai", "gk.dairoot.cn"])) {
    match = /^\/(?:c|chat)\/([^/?#]+)/i.exec(path);
    return match ? identity("grok", match[1]) : null;
  }
  if (hostMatches(host, ["deepseek.com"])) {
    match = /\/(?:a\/)?chat\/s\/([^/?#]+)/i.exec(path);
    return match ? identity("deepseek", match[1]) : null;
  }
  return null;
}

export function sameDeleteConversationIdentity(left, right) {
  const normalizedLeft = normalizeDeleteConversationIdentity(left);
  const normalizedRight = normalizeDeleteConversationIdentity(right);
  return Boolean(
    normalizedLeft
    && normalizedRight
    && normalizedLeft.provider === normalizedRight.provider
    && normalizedLeft.id === normalizedRight.id
  );
}

export function deleteCompletionTargetState(expectedIdentity, currentHref, linkHrefs = []) {
  const expected = normalizeDeleteConversationIdentity(expectedIdentity);
  if (!expected) return null;
  const current = deleteConversationIdentityFromHref(currentHref);
  const present = (Array.isArray(linkHrefs) ? linkHrefs : []).some((href) => (
    sameDeleteConversationIdentity(expected, deleteConversationIdentityFromHref(href, currentHref))
  ));
  return {
    identity: expected,
    current: sameDeleteConversationIdentity(expected, current),
    present
  };
}

export function inspectDeleteCompletionState(value, expectedIdentity = null) {
  const expected = normalizeDeleteConversationIdentity(expectedIdentity);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { valid: false, complete: false, reason: "completion-state probe returned no object" };
  }
  if (value.version !== DELETE_COMPLETION_STATE_VERSION) {
    return { valid: false, complete: false, reason: "completion-state probe returned an unsupported version" };
  }
  if (typeof value.present !== "boolean") {
    return { valid: false, complete: false, reason: "completion-state probe omitted the confirmation-dialog state" };
  }
  if (!expected) {
    if (value.target !== null) {
      return { valid: false, complete: false, reason: "completion-state probe returned an unexpected target identity" };
    }
    return {
      valid: true,
      complete: false,
      dialogPresent: value.present,
      target: null,
      state: value
    };
  }
  const target = value.target;
  if (!target || typeof target !== "object" || Array.isArray(target)) {
    return { valid: false, complete: false, reason: "completion-state probe omitted the target identity state" };
  }
  if (!sameDeleteConversationIdentity(expected, target.identity)) {
    return { valid: false, complete: false, reason: "completion-state probe returned a mismatched target identity" };
  }
  if (typeof target.current !== "boolean" || typeof target.present !== "boolean") {
    return { valid: false, complete: false, reason: "completion-state probe returned malformed target identity state" };
  }
  return {
    valid: true,
    complete: value.present === false && target.current === false && target.present === false,
    dialogPresent: value.present,
    target: {
      identity: expected,
      current: target.current,
      present: target.present
    },
    state: value
  };
}
