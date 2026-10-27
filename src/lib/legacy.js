// Idempotent legacy-data migrations (v2 07 §2). Each one owns a version/flag setting (usually an
// optionKey-backed hidden field) and runs only while that marker is below `version`.

export function runLegacyMigration(ctx, markerKey, version, fn) {
  const current = ctx.settings[markerKey];
  const done = version === true ? current === true : Number(current) >= version;
  if (done) return false;
  try {
    fn(ctx.settings);
  } catch (error) {
    ctx.logger.error(`Legacy migration "${markerKey}" failed:`, error);
    return false;
  }
  ctx.settings[markerKey] = version;
  return true;
}
