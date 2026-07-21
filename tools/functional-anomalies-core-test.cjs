#!/usr/bin/env node

const assert = require("node:assert/strict");

(async () => {
  const anomalies = await import("../shared/functional-anomalies.js");
  const {
    formatFunctionalAnomalyExport,
    recordFunctionalAnomaly
  } = anomalies;
  const FUNCTIONAL_ANOMALY_MAX_RECORDS = 200;
  const FUNCTIONAL_ANOMALY_MERGE_WINDOW_MS = 5 * 60 * 1000;

  let id = 0;
  const createId = () => `record-${++id}`;
  const details = {
    feature: "topic-delete",
    operation: "confirm",
    appId: "gemini",
    appName: "Gemini",
    href: "https://gemini.google.com/app/private-thread?token=secret#message",
    errorName: "RemoteError",
    errorCode: "TIMEOUT",
    delivered: true,
    reason: "request https://example.com/private/path?api_key=secret#fragment",
    message: "Bearer private-token apiKey=private-key prompt='private prompt' cookie=session-secret\n    at privateStack (/secret/file.js:1:2)",
    severity: "warn",
    appVersion: "test-version",
    surface: "Tabbit",
    prompt: "must not persist",
    cookies: "must not persist",
    apiKey: "must not persist",
    stack: "must not persist"
  };

  const first = recordFunctionalAnomaly([], details, { now: 1000, createId });
  assert.equal(first.records.length, 1);
  assert.equal(first.record.schemaVersion, 1);
  assert.equal(first.record.host, "gemini.google.com");
  assert.equal(first.record.severity, "warning");
  assert.equal(first.record.count, 1);
  assert.doesNotMatch(JSON.stringify(first.record), /private-thread|secret#message|private-token|private-key|private prompt|session-secret|privateStack|must not persist/);
  for (const forbidden of ["href", "path", "prompt", "cookies", "apiKey", "stack"]) {
    assert.equal(Object.hasOwn(first.record, forbidden), false, `${forbidden} must not be stored`);
  }

  const merged = recordFunctionalAnomaly(first.records, details, {
    now: 1000 + FUNCTIONAL_ANOMALY_MERGE_WINDOW_MS,
    createId
  });
  assert.equal(merged.records.length, 1);
  assert.equal(merged.record.id, first.record.id);
  assert.equal(merged.record.count, 2);

  const outsideWindow = recordFunctionalAnomaly(merged.records, details, {
    now: merged.record.updatedAt + FUNCTIONAL_ANOMALY_MERGE_WINDOW_MS + 1,
    createId
  });
  assert.equal(outsideWindow.records.length, 2);
  assert.equal(outsideWindow.record.count, 1);

  let records = [];
  for (let index = 0; index < FUNCTIONAL_ANOMALY_MAX_RECORDS + 9; index += 1) {
    records = recordFunctionalAnomaly(records, {
      feature: "test",
      operation: `operation-${index}`,
      message: `failure-${index}`
    }, { now: 100000 + index, createId }).records;
  }
  assert.equal(records.length, FUNCTIONAL_ANOMALY_MAX_RECORDS);
  assert.equal(records[0].operation, `operation-${FUNCTIONAL_ANOMALY_MAX_RECORDS + 8}`);
  assert.equal(records.some((record) => record.operation === "operation-0"), false);

  const exported = formatFunctionalAnomalyExport(first.records);
  const parsed = JSON.parse(exported);
  assert.equal(parsed.schemaVersion, 1);
  assert.equal(parsed.records.length, 1);
  assert.equal(Object.hasOwn(parsed.records[0], "fingerprint"), false);
  assert.doesNotMatch(exported, /private-thread|private-token|private-key|private prompt|session-secret|privateStack/);

  const jsonSecrets = recordFunctionalAnomaly([], {
    feature: "api",
    operation: "request",
    message: '{"api_key":"super-secret","access_token":"secret-token","refresh_token":"refresh-secret","client_secret":"client-secret","session":"session=value","credential":"private-credential","prompt":"My medical chat","cookie":"cookie=value"}'
  }, { now: 2000, createId });
  assert.doesNotMatch(jsonSecrets.record.message, /super-secret|secret-token|refresh-secret|client-secret|session=value|private-credential|My medical chat|cookie=value/);
  assert.match(jsonSecrets.record.message, /\[redacted\]/);

  const urlPaths = recordFunctionalAnomaly([], {
    feature: "runtime",
    operation: "load",
    message: "file:///Users/alice/private.txt moz-extension://extension-id/private/path?token=value example.test/private/path?x=1 /app/private-thread ./relative/private ../parent/private C:\\Users\\alice\\secret.txt \\\\server\\share\\secret.txt"
  }, { now: 3000, createId });
  assert.doesNotMatch(urlPaths.record.message, /Users|private\.txt|private\/path|token=value|\?x=1|app\/private|relative\/private|parent\/private|server|share|secret\.txt/);
  assert.match(urlPaths.record.message, /file:\/\/|moz-extension:\/\/extension-id|example\.test/);
  assert.match(urlPaths.record.message, /\[path-redacted\]/);

  const ordinarySlashes = recordFunctionalAnomaly([], {
    feature: "formatting",
    operation: "render",
    message: "send/receive ratio 1/2"
  }, { now: 4000, createId });
  assert.equal(ordinarySlashes.record.message, "send/receive ratio 1/2");

  console.log("functional anomaly normalization, privacy, merge, limit, and export: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
