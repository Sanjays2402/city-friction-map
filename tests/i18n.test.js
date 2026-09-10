import test from "node:test";
import assert from "node:assert/strict";

// Install a fake localStorage before importing the module so persistence
// behavior can be exercised in Node.
const store = {};
globalThis.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => {
    store[k] = String(v);
  },
  removeItem: (k) => {
    delete store[k];
  },
};

const mod = await import("../src/i18n.js");
const { t, setLang, currentLang, applyI18n, SUPPORTED_LANGS, STRINGS } = mod;

function reset() {
  setLang("en");
  delete store["friction-lang"];
}

function leafPaths(obj, prefix = "") {
  const out = [];
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === "object") out.push(...leafPaths(v, path));
    else out.push(path);
  }
  return out;
}

test("t() resolves English strings by default", () => {
  reset();
  assert.equal(currentLang(), "en");
  assert.equal(t("header.report"), "＋ Report friction");
  assert.equal(t("dialogs.report.title"), "What’s slowing things down?");
  assert.equal(
    t("toasts.zoneSaved"),
    "Zone saved. We'll watch it for new friction.",
  );
});

test("setLang('es') switches lookups to Spanish", () => {
  assert.equal(setLang("es"), true);
  assert.equal(currentLang(), "es");
  assert.equal(t("header.report"), "＋ Reportar un obstáculo");
  assert.equal(t("dialogs.report.title"), "¿Qué está frenando las cosas?");
  reset();
});

test("t() falls back to English for a key missing in Spanish", () => {
  const backup = STRINGS.es.toasts.reportNotFound;
  delete STRINGS.es.toasts.reportNotFound;
  try {
    setLang("es");
    assert.equal(t("toasts.reportNotFound"), STRINGS.en.toasts.reportNotFound);
  } finally {
    STRINGS.es.toasts.reportNotFound = backup;
    reset();
  }
});

test("t() falls back to the key itself for unknown keys", () => {
  reset();
  assert.equal(t("no.such.key"), "no.such.key");
  setLang("es");
  assert.equal(t("no.such.key"), "no.such.key");
  reset();
});

test("t() interpolates {name} placeholders from vars", () => {
  reset();
  assert.equal(
    t("dialogs.profile.badgesCount", { earned: 3, total: 9 }),
    "3/9",
  );
  assert.equal(
    t("toasts.levelUp", { icon: "🌱", name: "Newcomer" }),
    "🎉 Level up! You're now 🌱 Newcomer.",
  );
  setLang("es");
  assert.equal(
    t("dialogs.profile.badgesCount", { earned: 3, total: 9 }),
    "3/9",
  );
  // Missing vars leave the placeholder untouched.
  assert.equal(t("dialogs.profile.badgesCount"), "{earned}/{total}");
  // Calls without vars leave strings as-is.
  assert.equal(t("header.report"), "＋ Reportar un obstáculo");
  reset();
});

test("setLang() rejects unknown languages", () => {
  reset();
  assert.equal(setLang("fr"), false);
  assert.equal(setLang(""), false);
  assert.equal(currentLang(), "en");
  assert.equal(store["friction-lang"], undefined);
});

test("setLang() persists the language and reloads it from storage", async () => {
  reset();
  setLang("es");
  assert.equal(store["friction-lang"], "es");
  const fresh = await import("../src/i18n.js?persist=1");
  assert.equal(fresh.currentLang(), "es");
  reset();
});

test("English and Spanish dictionaries have identical key sets", () => {
  const enKeys = leafPaths(STRINGS.en).sort();
  const esKeys = leafPaths(STRINGS.es).sort();
  assert.ok(enKeys.length >= 80, `expected 80+ keys, got ${enKeys.length}`);
  assert.deepEqual(esKeys, enKeys);
  for (const path of enKeys) {
    const value = path
      .split(".")
      .reduce((node, part) => node[part], STRINGS.es);
    assert.equal(
      typeof value,
      "string",
      `es value at ${path} should be a string`,
    );
  }
});

test("SUPPORTED_LANGS lists English and Spanish", () => {
  assert.deepEqual(SUPPORTED_LANGS, [
    { id: "en", label: "English" },
    { id: "es", label: "Español" },
  ]);
});

test("applyI18n() is a safe no-op without a DOM", () => {
  assert.doesNotThrow(() => applyI18n());
  assert.doesNotThrow(() => applyI18n(null));
  assert.doesNotThrow(() => applyI18n(undefined));
});
