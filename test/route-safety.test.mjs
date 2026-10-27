import test from "node:test";
import assert from "node:assert/strict";
import { restorableHref, decodeFully } from "../src/lib/route-safety.js";

const APP = "https://app.notion.com/ai";

test("Notion keeps only /ai and /chat?t=<id>", () => {
  assert.equal(restorableHref("https://app.notion.com/ai", APP), "https://app.notion.com/ai");
  assert.equal(restorableHref("https://app.notion.com/chat?t=abc123DEF", APP), "https://app.notion.com/chat?t=abc123DEF");
  assert.equal(restorableHref("https://app.notion.com/chat?t=abc123&x=1", APP), "https://app.notion.com/ai");
  assert.equal(restorableHref("https://app.notion.com/login?redirect=%2Fai", APP), "https://app.notion.com/ai");
  assert.equal(restorableHref("https://www.notion.so/oauth2callback?code=1", APP), "https://app.notion.com/ai");
  assert.equal(restorableHref("https://app.notion.com/api/v3/x", APP), "https://app.notion.com/ai");
  assert.equal(restorableHref("https://app.notion.com/Workspace-page-123", APP), "https://app.notion.com/ai");
});

test("encoded sign-in paths are caught and bad encodings fail closed", () => {
  assert.equal(restorableHref("https://app.notion.com/chat?t=abc123%2526login", APP), "https://app.notion.com/ai");
  assert.equal(restorableHref("https://app.notion.com/%E0%A4%A", APP), "https://app.notion.com/ai");
  assert.equal(decodeFully("%25252F"), "/");
  assert.equal(decodeFully("%E0%A4%A"), null);
});

test("other sites are untouched", () => {
  assert.equal(restorableHref("https://chatgpt.com/auth/login", "https://chatgpt.com/"), "https://chatgpt.com/auth/login");
});
