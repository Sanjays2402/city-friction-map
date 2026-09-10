// Pure keyboard-shortcut helpers. DOM wiring lives in main.js;
// tested in tests/shortcuts.test.js.

export function isTypingTarget(el) {
  if (!el) return false;
  return (
    /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName || "") || !!el.isContentEditable
  );
}

export function shortcutFor(key) {
  if (key === "/") return "focus-search";
  if (key === "?") return "open-about";
  if (key === "f") return "toggle-followed";
  return null;
}
