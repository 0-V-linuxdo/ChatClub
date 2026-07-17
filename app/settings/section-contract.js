export function linesFromText(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function requireSettingsSectionStatePort(state, controllerName, expectedKeys) {
  const actual = Object.keys(state).sort();
  const expected = [...expectedKeys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new TypeError(`${controllerName} requires its dedicated settings section state port.`);
  }
  return state;
}
