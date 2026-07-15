export const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function deadlineFromPayload(payload = {}, fallbackMs = 10000) {
  const value = Number(payload?.deadlineAt);
  return Number.isFinite(value) && value > Date.now()
    ? value
    : Date.now() + Math.max(1000, Number(fallbackMs) || 10000);
}

export function remainingDeadlineMs(deadlineAt, fallbackMs = 1000) {
  const value = Number(deadlineAt);
  if (!Number.isFinite(value) || value <= 0) return Math.max(0, Number(fallbackMs) || 0);
  return Math.max(0, value - Date.now());
}

export const deadlineExpired = (deadlineAt) => remainingDeadlineMs(deadlineAt, 1) <= 0;

export async function waitUntilDeadline(ms, deadlineAt) {
  const delay = Math.min(Math.max(0, Number(ms) || 0), remainingDeadlineMs(deadlineAt, ms));
  if (delay <= 0) return false;
  await wait(delay);
  return !deadlineExpired(deadlineAt);
}

export const normalize = (value) => String(value || "")
  .replace(/\u00a0/g, " ")
  .replace(/\r\n?/g, "\n")
  .trim();

export const compact = (value) => normalize(value).toLowerCase().replace(/\s+/g, "");
