import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseImport,
  toGeoJSON,
  validateImportFeature,
} from "../src/geojson.js";

const rows = [
  {
    id: "r1",
    category: "queue",
    title: "Coffee queue",
    location: "Market Street",
    description: "Long line",
    lat: 37.77,
    lng: -122.42,
    severity: 2,
    status: "active",
    confirmations: 3,
    createdAt: 1000,
    updatedAt: 2000,
  },
];

test("toGeoJSON emits Point features with lng/lat order", () => {
  const doc = toGeoJSON(rows);
  assert.equal(doc.type, "FeatureCollection");
  assert.equal(doc.features.length, 1);
  const f = doc.features[0];
  assert.equal(f.type, "Feature");
  assert.deepEqual(f.geometry, {
    type: "Point",
    coordinates: [-122.42, 37.77],
  });
  assert.equal(f.properties.title, "Coffee queue");
  assert.equal(f.properties.severity, 2);
});

test("validateImportFeature cleans a valid feature", () => {
  const body = validateImportFeature(
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [-122.42, 37.77] },
      properties: {
        category: "noise",
        title: "  Loud drilling  ",
        location: "Mission St",
      },
    },
    0,
  );
  assert.deepEqual(body, {
    category: "noise",
    title: "Loud drilling",
    location: "Mission St",
    description: "",
    lat: 37.77,
    lng: -122.42,
    severity: 2,
  });
});

test("validateImportFeature rejects bad features with reasons", () => {
  const good = {
    type: "Feature",
    geometry: { type: "Point", coordinates: [-122.42, 37.77] },
    properties: { category: "queue", title: "A queue", location: "Market St" },
  };
  const cases = [
    [{ ...good, type: "Point" }, /expected a GeoJSON Feature/],
    [
      { ...good, geometry: { type: "LineString", coordinates: [] } },
      /must be a Point/,
    ],
    [
      {
        ...good,
        geometry: { type: "Point", coordinates: [-74.0, 40.7] },
      },
      /outside San Francisco/,
    ],
    [
      { ...good, properties: { ...good.properties, category: "aliens" } },
      /unknown category/,
    ],
    [
      { ...good, properties: { ...good.properties, title: "ab" } },
      /title must be/,
    ],
    [
      { ...good, properties: { ...good.properties, severity: 9 } },
      /severity must be/,
    ],
  ];
  for (const [feature, pattern] of cases)
    assert.throws(() => validateImportFeature(feature, 4), pattern);
});

test("parseImport accepts collections and rejects junk", () => {
  assert.deepEqual(
    parseImport('{"type":"FeatureCollection","features":[]}'),
    [],
  );
  assert.throws(() => parseImport("not json"), /not valid JSON/);
  assert.throws(
    () => parseImport('{"type":"Feature","geometry":null}'),
    /FeatureCollection/,
  );
  assert.throws(
    () =>
      parseImport(
        `{"type":"FeatureCollection","features":new Array(501).fill(0)}`,
      ),
    /not valid JSON/,
  );
  const big = {
    type: "FeatureCollection",
    features: new Array(501).fill({
      type: "Feature",
      geometry: { type: "Point", coordinates: [-122.42, 37.77] },
      properties: {},
    }),
  };
  assert.throws(() => parseImport(JSON.stringify(big)), /limited to 500/);
});
