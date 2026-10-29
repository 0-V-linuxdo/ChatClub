import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// The options page lists shortcuts from each plugin's static `shortcutActions`, so every action a
// plugin contributes at runtime must also be declared there.
test("every contributed shortcut action is declared in shortcutActions", async () => {
  const root = path.resolve("src/plugins");
  const missing = [];
  for (const dir of fs.readdirSync(root)) {
    const app = path.join(root, dir, "app.js");
    if (!fs.existsSync(app)) continue;
    const ids = [...fs.readFileSync(app, "utf8").matchAll(/contribute\("shortcut\.action",\s*\{\s*id:\s*"([^"]+)"/g)].map((m) => m[1]);
    if (!ids.length) continue;
    const plugin = (await import(path.join(root, dir, "index.js"))).default;
    const declared = new Set((plugin.shortcutActions ?? []).map((a) => a.id));
    for (const id of ids) if (!declared.has(id)) missing.push(`${dir}:${id}`);
  }
  assert.deepEqual(missing, []);
});
