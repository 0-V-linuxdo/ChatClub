// Generic names describe how a workspace came about, not what it is about (v2 02 §10.2).

export function isGenericTitle(title) {
  const text = String(title ?? "").trim();
  if (!text) return true;
  return /^(ChatClub( \d+)?|Prompt|Restore group|一键恢复)$/i.test(text);
}
