import { test } from "node:test";
import assert from "node:assert/strict";
import { isTypingTarget, shortcutFor } from "../src/shortcuts.js";

test("shortcutFor maps keys to actions", () => {
  assert.equal(shortcutFor("/"), "focus-search");
  assert.equal(shortcutFor("?"), "open-about");
  assert.equal(shortcutFor("f"), "toggle-followed");
  assert.equal(shortcutFor("F"), null);
  assert.equal(shortcutFor("Escape"), null);
  assert.equal(shortcutFor("x"), null);
});

test("isTypingTarget detects editable elements", () => {
  assert.equal(isTypingTarget(null), false);
  assert.equal(isTypingTarget({ tagName: "DIV" }), false);
  assert.equal(isTypingTarget({ tagName: "INPUT" }), true);
  assert.equal(isTypingTarget({ tagName: "textarea" }), false);
  assert.equal(isTypingTarget({ tagName: "TEXTAREA" }), true);
  assert.equal(isTypingTarget({ tagName: "SELECT" }), true);
  assert.equal(
    isTypingTarget({ tagName: "DIV", isContentEditable: true }),
    true,
  );
});
