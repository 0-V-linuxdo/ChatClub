// Loads the built extension in Chromium, opens a page, records console errors and a screenshot.
// Usage: node scripts/smoke.mjs [page=chatClub.html] [out.png] [evalFile...]
// Each eval file runs in order; a result of { reload: true } reloads the page before the next one.
import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require(path.join(process.execPath, "../../lib/node_modules/playwright")); }
const ext = path.resolve("dist/extension");
const page = process.argv[2] || "chatClub.html";
const out = process.argv[3] || "/tmp/claude-0/smoke.png";
const evalFiles = process.argv.slice(4);
const userDir = fs.mkdtempSync("/tmp/claude-0/pw-");
const ctx = await pw.chromium.launchPersistentContext(userDir, {
  headless: true,
  executablePath: "/opt/pw-browsers/chromium",
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, "--headless=new"],
  viewport: { width: 1440, height: 900 },
});
let sw = ctx.serviceWorkers()[0] || (await ctx.waitForEvent("serviceworker", { timeout: 10000 }));
const id = new URL(sw.url()).host;
const logs = [];
sw.on("console", (m) => logs.push(`[sw:${m.type()}] ${m.text()}`));
const p = await ctx.newPage();
p.on("console", (m) => logs.push(`[page:${m.type()}] ${m.text()}`));
p.on("pageerror", (e) => logs.push(`[page:UNCAUGHT] ${e.message}`));
await p.goto(`chrome-extension://${id}/${page}`);
await p.waitForTimeout(2500);
for (const evalFile of evalFiles) {
  const code = fs.readFileSync(evalFile, "utf8");
  let result;
  try {
    result = await p.evaluate(code);
    console.log(`EVAL ${path.basename(evalFile)}:`, JSON.stringify(result, null, 1));
  } catch (e) {
    console.log("EVAL ERROR", e.message);
  }
  await p.waitForTimeout(800);
  if (result?.reload) {
    await p.reload();
    await p.waitForTimeout(2500);
  }
}
if (process.env.SMOKE_SECOND_TAB) {
  // Inspect the most recently opened extension tab (e.g. a workspace opened by the page).
  await p.waitForTimeout(4000);
  const pages = ctx.pages();
  const last = pages[pages.length - 1];
  if (last !== p) {
    const code = fs.readFileSync(process.env.SMOKE_SECOND_TAB, "utf8");
    try { console.log("EVAL second tab:", JSON.stringify(await last.evaluate(code), null, 1)); } catch (e) { console.log("EVAL second ERROR", e.message); }
  }
}
await p.screenshot({ path: out });
console.log(logs.join("\n"));
await ctx.close();
