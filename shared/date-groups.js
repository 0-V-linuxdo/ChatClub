const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
const DATE_GROUP_DEFS = Object.freeze([
  Object.freeze({ id: "today" }),
  Object.freeze({ id: "yesterday" }),
  Object.freeze({ id: "pastWeek" }),
  Object.freeze({ id: "pastMonth" }),
  Object.freeze({ id: "older" })
]);

export function timestamp(value) {
  const parsed = value instanceof Date
    ? value.getTime()
    : typeof value === "number" ? value : Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function localCalendarDay(timestampValue) {
  const date = new Date(timestampValue);
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / MILLISECONDS_PER_DAY;
}

export function dateGroupId(createdAt, now = Date.now()) {
  const createdTimestamp = timestamp(createdAt);
  const nowTimestamp = timestamp(now);
  if (createdTimestamp === null || nowTimestamp === null) return "older";
  const daysAgo = localCalendarDay(nowTimestamp) - localCalendarDay(createdTimestamp);
  if (daysAgo <= 0) return "today";
  if (daysAgo === 1) return "yesterday";
  if (daysAgo <= 7) return "pastWeek";
  if (daysAgo <= 30) return "pastMonth";
  return "older";
}

function dateGroups(labelPrefix = "promptHistory") {
  return DATE_GROUP_DEFS.map((group) => ({
    id: group.id,
    labelKey: `${labelPrefix}.${group.id}`
  }));
}

export function groupByDate(items = [], getTime, now = Date.now(), labelPrefix = "promptHistory") {
  const groups = dateGroups(labelPrefix);
  const grouped = new Map(groups.map(({ id }) => [id, []]));
  const timeOf = typeof getTime === "function" ? getTime : (item) => item?.createdAt;
  for (const item of Array.isArray(items) ? items : []) {
    grouped.get(dateGroupId(timeOf(item), now))?.push(item);
  }
  return groups
    .map((group) => ({ ...group, items: grouped.get(group.id) }))
    .filter((group) => group.items.length);
}
