// City switcher module. resolveCity / readStoredCity / writeStoredCity are
// pure and storage-guarded so they run in node tests; initCitySwitcher wires
// a <select> into the DOM and returns { element, setCity } (null without DOM).
import { DEFAULT_CITY } from "../server/cities.js";

const STORAGE_KEY = "friction-city";

/** Pure: stored city, else the sf default, else the first city, else null. */
export function resolveCity(cities, storedId) {
  const list = Array.isArray(cities) ? cities : [];
  return (
    list.find((c) => c.id === storedId) ||
    list.find((c) => c.id === DEFAULT_CITY) ||
    list[0] ||
    null
  );
}

/** Read the persisted city id, or null when storage is unavailable. */
export function readStoredCity(storage) {
  if (!storage || typeof storage.getItem !== "function") return null;
  try {
    return storage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Persist the city id. No-op when storage is unavailable. */
export function writeStoredCity(storage, id) {
  if (!storage || typeof storage.setItem !== "function") return;
  try {
    storage.setItem(STORAGE_KEY, id);
  } catch {
    // Storage unavailable (private mode, disabled cookies): ignore.
  }
}

function browserStorage() {
  return typeof localStorage !== "undefined" ? localStorage : undefined;
}

/**
 * Render a city <select> into mount and persist the user's choice.
 * Returns { element, setCity(id) }, or null when there is no mount/DOM.
 */
export function initCitySwitcher({ cities, current, onChange, mount } = {}) {
  const doc = typeof document !== "undefined" ? document : null;
  if (!mount || !doc) return null;
  const list = Array.isArray(cities) ? cities : [];

  const select = doc.createElement("select");
  select.className = "city-select";
  select.setAttribute("aria-label", "Choose city");
  for (const city of list) {
    const option = doc.createElement("option");
    option.value = city.id;
    option.textContent = city.name;
    if (city.id === current) option.selected = true;
    select.appendChild(option);
  }

  select.addEventListener("change", () => {
    const id = select.value;
    writeStoredCity(browserStorage(), id);
    if (typeof onChange === "function") onChange(id);
  });

  mount.appendChild(select);
  return {
    element: select,
    setCity(id) {
      select.value = id;
    },
  };
}
