#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

function hasReport(source, feature, operation) {
  const escapedFeature = feature.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedOperation = operation.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `recordFunctionalAnomaly\\(\\{[\\s\\S]{0,500}?feature:\\s*"${escapedFeature}"[\\s\\S]{0,300}?operation:\\s*"${escapedOperation}"`
  ).test(source);
}

const composer = read("app/composer/controller.js");
assert.equal(hasReport(composer, "composer", "sendPrompt"), true);
const composerReportStart = composer.indexOf('feature: "composer"');
const composerReportEnd = composer.indexOf("});", composerReportStart);
const composerReport = composer.slice(composerReportStart, composerReportEnd);
assert.doesNotMatch(composerReport, /\b(?:text|images|promptText|promptImages)\b/, "prompt content must not enter anomaly records");

const preferredModel = read("app/preferred-model/controller.js");
assert.equal(hasReport(preferredModel, "preferredModel", "applyPreferredModel"), true);
assert.match(preferredModel, /if \(!record\.cancelled\) \{[\s\S]{0,600}?recordFunctionalAnomaly/);

const optimize = read("app/optimize/controller.js");
assert.equal(hasReport(optimize, "optimize", "optimizePrompt"), true);
assert.match(optimize, /controller\.signal\.aborted[\s\S]{0,250}?recordFunctionalAnomaly/);

const summary = read("app/summary/controller.js");
assert.match(summary, /feature:\s*"summary"/);
for (const operation of ["prepareCollector", "collectSource", "refreshSource", "generate"]) {
  assert.match(summary, new RegExp(`recordSummaryFailure\\("${operation}"`), `missing Summary ${operation} anomaly capture`);
}

const navigator = read("app/workspace/message-navigator-controller.js");
assert.equal(hasReport(navigator, "messageNavigator", "open"), true);
assert.equal(hasReport(navigator, "messageNavigator", "restore"), true);

const frameController = read("app/workspace/frame-controller.js");
assert.equal(hasReport(frameController, "topicDeletion", "deleteTopic"), true);

const runtime = read("app/runtime.js");
for (const [feature, operation] of [
  ["settings", "reloadRuntimeConfig"],
  ["newChat", "startNewChat"],
  ["topicDeletion", "deleteTopic"],
  ["runtime", "reconcileRegistration"],
  ["runtime", "initialize"]
]) {
  assert.equal(hasReport(runtime, feature, operation), true, `missing ${feature}/${operation} anomaly capture`);
}
assert.match(runtime, /if \(item\.reportable === false\) continue;/, "permission denials must not be recorded as functional anomalies");
assert.match(runtime, /feature:\s*"shortcuts"[\s\S]{0,120}?operation:\s*matched\.action/);
assert.match(runtime, /settledOperationFailure\(result,\s*"New chat did not start"\)/);
assert.match(runtime, /settledOperationFailure\(\{ status: "fulfilled", value: started \},\s*"New chat did not start"\)/);

const anomalyController = read("app/functional-anomalies/controller.js");
assert.match(
  anomalyController,
  /async function record\([\s\S]*?catch \{\s*return null;\s*\}/,
  "anomaly persistence failures must never break the originating feature"
);

const settings = read("app/settings/controller.js");
assert.match(settings, /feature:\s*"settings"[\s\S]{0,120}?operation:\s*`save\$\{sectionName/);
assert.match(settings, /catch \(error\) \{[\s\S]{0,350}?functionalAnomalyLog\.record[\s\S]{0,350}?throw error;/);

console.log("functional anomaly terminal-failure instrumentation and isolation: ok");
