function normalizedExpectedMajor(value, variableName) {
  const expected = String(value || "").trim();
  if (!/^\d+$/.test(expected)) {
    throw new Error(`${variableName} must be set to one numeric browser major version`);
  }
  return expected;
}

function browserMajor(version) {
  return String(version || "").trim().match(/^(\d+)/)?.[1] || "";
}

function chromiumVersionFromUserAgent(userAgent) {
  return String(userAgent || "").match(/(?:HeadlessChrome|Chrome|Chromium)\/(\d+(?:\.\d+)*)/i)?.[1] || "";
}

function assertExpectedBrowserMajor(browserName, actualVersion, expectedValue, variableName) {
  const expected = normalizedExpectedMajor(expectedValue, variableName);
  const actual = browserMajor(actualVersion);
  if (!actual) throw new Error(`${browserName}: could not determine browser major from ${actualVersion || "an empty version"}`);
  if (actual !== expected) throw new Error(`${browserName}: expected major ${expected}, got ${actualVersion}`);
  return actual;
}

function chromiumHeadlessLaunch(expectedMajor, headful = false) {
  if (headful) return Object.freeze({ headless: false, args: Object.freeze([]) });
  const useExplicitNewHeadless = Number(expectedMajor) < 132;
  return Object.freeze({
    headless: !useExplicitNewHeadless,
    args: Object.freeze(useExplicitNewHeadless ? ["--headless=new"] : [])
  });
}

module.exports = {
  normalizedExpectedMajor,
  browserMajor,
  chromiumVersionFromUserAgent,
  assertExpectedBrowserMajor,
  chromiumHeadlessLaunch
};
