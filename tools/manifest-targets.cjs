const CHROMIUM_ONLY_PERMISSIONS = new Set(["cookies", "debugger", "favicon"]);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function chromiumManifest(source) {
  const manifest = clone(source);
  manifest.background = {
    service_worker: "background/service-worker.js",
    type: "module"
  };
  return manifest;
}

function firefoxManifest(source) {
  const manifest = clone(source);
  manifest.background = {
    scripts: ["background/firefox-background.js"],
    type: "module"
  };
  manifest.permissions = (manifest.permissions || []).filter((permission) => !CHROMIUM_ONLY_PERMISSIONS.has(permission));
  manifest.browser_specific_settings = {
    gecko: {
      id: "chatclub@chatclub.local",
      data_collection_permissions: {
        required: [
          "authenticationInfo",
          "browsingActivity",
          "personalCommunications",
          "websiteContent"
        ]
      }
    }
  };
  return manifest;
}

function targetManifest(source, target = "chromium") {
  if (target === "chromium") return chromiumManifest(source);
  if (target === "firefox") return firefoxManifest(source);
  throw new Error(`Unknown extension target: ${target}`);
}

module.exports = { targetManifest };
