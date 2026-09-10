import { test } from "node:test";
import assert from "node:assert/strict";
import {
  currentTheme,
  defaultTheme,
  initTheme,
  toggleTheme,
} from "../src/darkmode.js";

function fakeStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, value);
    },
  };
}

function fakeRoot(theme) {
  const dataset = {};
  if (theme) dataset.theme = theme;
  return { dataset };
}

test("init defaults to light when nothing stored and no media preference", () => {
  const root = fakeRoot();
  const theme = initTheme({
    storage: fakeStorage(),
    root,
    media: { matches: false },
  });
  assert.equal(theme, "light");
  assert.equal(root.dataset.theme, "light");
});

test("init follows prefers-color-scheme: dark when available", () => {
  const root = fakeRoot();
  const theme = initTheme({
    storage: fakeStorage(),
    root,
    media: { matches: true },
  });
  assert.equal(theme, "dark");
  assert.equal(root.dataset.theme, "dark");
});

test("stored preference wins over the OS default", () => {
  const root = fakeRoot();
  const theme = initTheme({
    storage: fakeStorage({ "friction-theme": "light" }),
    root,
    media: { matches: true },
  });
  assert.equal(theme, "light");
  assert.equal(root.dataset.theme, "light");
});

test("toggle flips the theme, persists it, and updates the dataset", () => {
  const storage = fakeStorage();
  const root = fakeRoot("light");
  const next = toggleTheme({ storage, root });
  assert.equal(next, "dark");
  assert.equal(root.dataset.theme, "dark");
  assert.equal(storage.getItem("friction-theme"), "dark");
  assert.equal(toggleTheme({ storage, root }), "light");
  assert.equal(storage.getItem("friction-theme"), "light");
});

test("invalid stored value falls back to the default theme", () => {
  assert.equal(
    initTheme({
      storage: fakeStorage({ "friction-theme": "banana" }),
      root: fakeRoot(),
      media: { matches: true },
    }),
    "dark",
  );
  assert.equal(
    initTheme({
      storage: fakeStorage({ "friction-theme": "" }),
      root: fakeRoot(),
      media: { matches: false },
    }),
    "light",
  );
});

test("initTheme is a safe no-op without a DOM", () => {
  assert.equal(initTheme(), "light");
});

test("toggleTheme and currentTheme do not throw without a DOM", () => {
  assert.equal(currentTheme(), "light");
  assert.equal(toggleTheme(), "dark");
});

test("currentTheme reflects the dataset value", () => {
  assert.equal(currentTheme({ root: fakeRoot("dark") }), "dark");
  assert.equal(currentTheme({ root: fakeRoot() }), "light");
});

test("defaultTheme returns light when media is unavailable", () => {
  assert.equal(defaultTheme(null), "light");
  assert.equal(defaultTheme({ matches: true }), "dark");
});
