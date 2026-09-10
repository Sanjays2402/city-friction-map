// Pure GeoJSON helpers: export the current report list and validate an
// imported FeatureCollection before each feature is POSTed individually.
// Tested in tests/geojson.test.js.

import { categories } from "../server/domain.js";

const SF_BOUNDS = { lat: [37.7, 37.84], lng: [-122.53, -122.35] };

export function toGeoJSON(rows) {
  return {
    type: "FeatureCollection",
    features: rows.map((r) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [r.lng, r.lat] },
      properties: {
        id: r.id,
        category: r.category,
        title: r.title,
        location: r.location,
        description: r.description || "",
        severity: r.severity,
        status: r.status,
        confirmations: r.confirmations,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      },
    })),
  };
}

function cleanString(value, min, max, name) {
  const text = typeof value === "string" ? value.trim() : "";
  if (text.length < min || text.length > max)
    throw new Error(`${name} must be ${min}–${max} characters.`);
  return text;
}

export function validateImportFeature(feature, index) {
  const where = `Feature ${index + 1}`;
  if (!feature || feature.type !== "Feature")
    throw new Error(`${where}: expected a GeoJSON Feature.`);
  const coords = feature.geometry && feature.geometry.coordinates;
  if (
    !feature.geometry ||
    feature.geometry.type !== "Point" ||
    !Array.isArray(coords) ||
    coords.length < 2 ||
    !Number.isFinite(coords[0]) ||
    !Number.isFinite(coords[1])
  )
    throw new Error(`${where}: geometry must be a Point with [lng, lat].`);
  const [lng, lat] = coords;
  if (
    lat < SF_BOUNDS.lat[0] ||
    lat > SF_BOUNDS.lat[1] ||
    lng < SF_BOUNDS.lng[0] ||
    lng > SF_BOUNDS.lng[1]
  )
    throw new Error(`${where}: coordinates fall outside San Francisco.`);
  const props = feature.properties || {};
  if (!Object.hasOwn(categories, props.category))
    throw new Error(`${where}: unknown category "${props.category}".`);
  const severity = props.severity === undefined ? 2 : Number(props.severity);
  if (![1, 2, 3].includes(severity))
    throw new Error(`${where}: severity must be 1, 2, or 3.`);
  return {
    category: props.category,
    title: cleanString(props.title, 3, 100, `${where} title`),
    location: cleanString(props.location, 3, 100, `${where} location`),
    description: cleanString(
      props.description || "",
      0,
      500,
      `${where} description`,
    ),
    lat,
    lng,
    severity,
  };
}

export function parseImport(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("That file is not valid JSON.");
  }
  const features =
    parsed && parsed.type === "FeatureCollection"
      ? parsed.features
      : Array.isArray(parsed)
        ? parsed
        : null;
  if (!Array.isArray(features))
    throw new Error("Expected a GeoJSON FeatureCollection.");
  if (features.length > 500)
    throw new Error("Imports are limited to 500 features at a time.");
  return features;
}
