export function invokeActiveRuntimeMethod(
  registryKey,
  registryAbiVersion,
  generation,
  runtimeName,
  runtimeVersion,
  methodName,
  payload
) {
  const broker = globalThis[registryKey];
  if (
    broker?.abiVersion !== registryAbiVersion
    || broker?.activeGenerationVersion !== generation
    || typeof broker.acquireGeneration !== "function"
  ) throw new Error("ChatClub runtime broker is unavailable or stale");
  const registry = broker.acquireGeneration(generation);
  if (registry?.isActive !== true || typeof registry.require !== "function") {
    throw new Error("ChatClub active runtime generation is unavailable");
  }
  const runtime = registry.require(runtimeName, runtimeVersion);
  const method = runtime?.[methodName];
  if (typeof method !== "function") throw new Error(`ChatClub runtime method is unavailable: ${methodName}`);
  return method(payload);
}

export function activeCustomSummaryRuntimeReady(
  executorKey,
  registryKey,
  registryAbiVersion,
  generation,
  expectedBundle
) {
  const executor = globalThis[executorKey];
  const broker = globalThis[registryKey];
  if (
    typeof executor !== "function"
    || broker?.abiVersion !== registryAbiVersion
    || broker?.activeGenerationVersion !== generation
    || typeof broker.acquireGeneration !== "function"
  ) return false;
  let registry = null;
  try { registry = broker.acquireGeneration(generation); } catch { return false; }
  if (registry?.isActive !== true) return false;
  const registered = registry.bundleRegistration?.(expectedBundle?.outputPath);
  return Boolean(
    registered
    && ["outputPath", "entryPath", "sourceSha256", "implementationSha256", "implementationVersion"]
      .every((field) => registered[field] === expectedBundle?.[field])
  );
}
