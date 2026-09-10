import { test } from "node:test";
import assert from "node:assert/strict";
import {
  initCitySwitcher,
  readStoredCity,
  resolveCity,
  writeStoredCity,
} from "../src/cities-ui.js";

const CITIES = [
  { id: "sf", name: "San Francisco" },
  { id: "sea", name: "Seattle" },
  { id: "nyc", name: "New York" },
];

test("resolveCity picks the stored city", () => {
  assert.equal(resolveCity(CITIES, "sea").id, "sea");
  assert.equal(resolveCity(CITIES, "nyc").id, "nyc");
});

test("resolveCity falls back to the sf default", () => {
  assert.equal(resolveCity(CITIES, "bogus").id, "sf");
  assert.equal(resolveCity(CITIES, null).id, "sf");
  assert.equal(resolveCity(CITIES, undefined).id, "sf");
});

test("resolveCity falls back to the first city without an sf match", () => {
  const cities = [
    { id: "sea", name: "Seattle" },
    { id: "nyc", name: "New York" },
  ];
  assert.equal(resolveCity(cities, "bogus").id, "sea");
});

test("resolveCity returns null for an empty list", () => {
  assert.equal(resolveCity([], "sea"), null);
  assert.equal(resolveCity(null, "sea"), null);
  assert.equal(resolveCity(undefined, "sea"), null);
});

function fakeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, v),
  };
}

test("readStoredCity/writeStoredCity round-trip with fake storage", () => {
  const storage = fakeStorage();
  assert.equal(readStoredCity(storage), null);
  writeStoredCity(storage, "sea");
  assert.equal(readStoredCity(storage), "sea");
  writeStoredCity(storage, "nyc");
  assert.equal(readStoredCity(storage), "nyc");
});

test("readStoredCity/writeStoredCity are safe without storage", () => {
  assert.equal(readStoredCity(undefined), null);
  writeStoredCity(undefined, "sea"); // must not throw
});

test("initCitySwitcher is a safe no-op without DOM", () => {
  assert.equal(initCitySwitcher({}), null);
  assert.equal(initCitySwitcher(undefined), null);
  assert.equal(
    initCitySwitcher({ cities: CITIES, current: "sf", mount: null }),
    null,
  );
});
