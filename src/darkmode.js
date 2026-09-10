// Theme preference helpers. DOM wiring lives in main.js;
// tested in tests/darkmode.test.js.

export const THEME_KEY = "friction-theme";
export const LIGHT = "light";
export const DARK = "dark";

function normalizeTheme(value) {
  return value === LIGHT || value === DARK ? value : null;
}

function resolveRoot(root) {
  if (root) return root;
  if (typeof document !== "undefined") return document.documentElement;
  return null;
}

function resolveStorage(storage) {
  if (storage) return storage;
  if (typeof localStorage !== "undefined") return localStorage;
  return null;
}

export function defaultTheme(media) {
  const query =
    media !== undefined
      ? media
      : typeof window !== "undefined" && typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-color-scheme: dark)")
        : null;
  return query && query.matches ? DARK : LIGHT;
}

// Reads the stored preference (falling back to the OS preference), applies it
// to documentElement.dataset.theme, and returns the theme. Safe to call in
// non-browser environments: returns "light" and never throws.
export function initTheme({ storage, root, media } = {}) {
  let theme = LIGHT;
  try {
    theme = defaultTheme(media);
    const store = resolveStorage(storage);
    const stored = store ? store.getItem(THEME_KEY) : null;
    theme = normalizeTheme(stored) ?? theme;
  } catch {
    theme = defaultTheme(media);
  }
  const el = resolveRoot(root);
  try {
    if (el && el.dataset) el.dataset.theme = theme;
  } catch {
    // Ignore DOM write failures; the returned theme is still authoritative.
  }
  return theme;
}

// Flips the current theme, persists the choice, updates the dataset, and
// returns the new theme.
export function toggleTheme({ storage, root } = {}) {
  const next = currentTheme({ root }) === DARK ? LIGHT : DARK;
  const el = resolveRoot(root);
  try {
    if (el && el.dataset) el.dataset.theme = next;
    const store = resolveStorage(storage);
    if (store) store.setItem(THEME_KEY, next);
  } catch {
    // Storage can be unavailable (private mode, SSR); dataset already updated.
  }
  return next;
}

// Reads the theme from the dataset; falls back to "light" when unset.
export function currentTheme({ root } = {}) {
  const el = resolveRoot(root);
  const value = el && el.dataset ? normalizeTheme(el.dataset.theme) : null;
  return value ?? LIGHT;
}
