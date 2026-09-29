import { test } from "node:test";
import assert from "node:assert/strict";
import { setAccent, readViews, ACCENT_KEY } from "../src/personalize.js";
test("accent choices persist, default to green, and tolerate blocked storage", () => {
  const values = {},
    storage = { setItem: (k, v) => (values[k] = v) },
    root = { dataset: { theme: "dark" } };
  for (const color of ["red", "yellow", "blue", "green"]) {
    assert.equal(setAccent(color, storage, root), color);
    assert.equal(values[ACCENT_KEY], color);
    assert.equal(root.dataset.theme, "dark");
  }
  assert.equal(setAccent("purple", storage, root), "green");
  assert.equal(
    setAccent(
      "blue",
      {
        setItem() {
          throw Error();
        },
      },
      root,
    ),
    "blue",
  );
});
test("bookmarks reject invalid coordinates, unknown cities and corrupt storage", () => {
  const valid = {
    name: "Work",
    city: "sf",
    lat: 37.77,
    lng: -122.42,
    zoom: 14,
  };
  const rows = [
    valid,
    { ...valid, lat: 999 },
    { ...valid, city: "unknown" },
    { ...valid, zoom: 99 },
    { ...valid, name: "" },
  ];
  assert.deepEqual(readViews({ getItem: () => JSON.stringify(rows) }, ["sf"]), [
    valid,
  ]);
  assert.deepEqual(readViews({ getItem: () => "{bad" }, ["sf"]), []);
  assert.equal(
    readViews({ getItem: () => JSON.stringify(Array(20).fill(valid)) }, ["sf"])
      .length,
    10,
  );
});
