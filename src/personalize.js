export const ACCENTS = ["green", "red", "yellow", "blue"];
export const ACCENT_KEY = "friction-accent";
export const VIEWS_KEY = "friction-map-views";
export function setAccent(value, storage, root) {
  const accent = ACCENTS.includes(value) ? value : "green";
  root.dataset.accent = accent;
  try {
    storage.setItem(ACCENT_KEY, accent);
  } catch {
    /* Session-only preference. */
  }
  return accent;
}
export function readViews(storage, cityIds) {
  try {
    const rows = JSON.parse(storage.getItem(VIEWS_KEY) || "[]");
    if (!Array.isArray(rows)) return [];
    return rows
      .filter(
        (v) =>
          v &&
          typeof v.name === "string" &&
          v.name.trim() &&
          v.name.length <= 40 &&
          cityIds.includes(v.city) &&
          Number.isFinite(v.lat) &&
          Math.abs(v.lat) <= 90 &&
          Number.isFinite(v.lng) &&
          Math.abs(v.lng) <= 180 &&
          Number.isFinite(v.zoom) &&
          v.zoom >= 1 &&
          v.zoom <= 19,
      )
      .slice(0, 10);
  } catch {
    return [];
  }
}
export function initPersonalization({
  map,
  getCity,
  switchCity,
  cities,
  spanish = false,
}) {
  const storage = localStorage,
    root = document.documentElement;
  const words = spanish
    ? {
        title: "Hazlo tuyo",
        color: "Color de acento",
        colors: ["Verde", "Rojo", "Amarillo", "Azul"],
        views: "Lugares guardados",
        hint: "Guarda el centro y el zoom del mapa. Se guardan solo en este navegador.",
        name: "Nombre del lugar",
        save: "Guardar vista actual",
        empty: "Aún no hay lugares guardados.",
        remove: "Eliminar",
        open: "Abrir",
        limit: "Máximo 10 lugares. Elimina uno para añadir otro.",
        error: "No se pudo guardar en este navegador.",
        close: "Cerrar",
        saved: "Vista guardada.",
      }
    : {
        title: "Make it yours",
        color: "Accent color",
        colors: ["Green", "Red", "Yellow", "Blue"],
        views: "Saved places",
        hint: "Save the map’s center and zoom. Places stay in this browser only.",
        name: "Place name",
        save: "Save current view",
        empty: "No saved places yet.",
        remove: "Remove",
        open: "Open",
        limit: "Limit of 10 places. Remove one to add another.",
        error: "Could not save in this browser.",
        close: "Close",
        saved: "View saved.",
      };
  let stored;
  try {
    stored = storage.getItem(ACCENT_KEY);
  } catch {
    /* Default green. */
  }
  let accent = setAccent(stored, storage, root);
  let views = readViews(
    storage,
    cities.map((c) => c.id),
  );
  const bar = document.createElement("section");
  bar.className = "personal-bar";
  const launch = document.createElement("button");
  launch.id = "personalize";
  launch.className = "preference";
  launch.textContent = `◈ ${words.title}`;
  bar.append(launch);
  document.querySelector(".workspace").before(bar);
  const dialog = document.createElement("dialog");
  dialog.id = "personal-dialog";
  dialog.innerHTML = `<button type="button" class="close" aria-label="${words.close}">×</button><div class="eyebrow">CITY FRICTION / YOU</div><h2>${words.title}</h2><h3>${words.color}</h3><div class="accent-options" role="group" aria-label="${words.color}"></div><h3>${words.views}</h3><p>${words.hint}</p><form id="save-view-form"><label>${words.name}<input name="name" maxlength="40" required autocomplete="off"></label><button class="primary" type="submit">${words.save}</button></form><p class="personal-status" role="status"></p><div class="saved-places"></div>`;
  document.body.append(dialog);
  launch.onclick = () => dialog.showModal();
  dialog.querySelector(".close").onclick = () => dialog.close();
  const options = dialog.querySelector(".accent-options");
  ACCENTS.forEach((color, i) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.color = color;
    button.textContent = words.colors[i];
    button.setAttribute("aria-pressed", String(accent === color));
    button.onclick = () => {
      accent = setAccent(color, storage, root);
      options
        .querySelectorAll("button")
        .forEach((b) =>
          b.setAttribute("aria-pressed", String(b.dataset.color === accent)),
        );
    };
    options.append(button);
  });
  const status = dialog.querySelector(".personal-status");
  function persist(next) {
    try {
      storage.setItem(VIEWS_KEY, JSON.stringify(next));
      views = next;
      renderViews();
      return true;
    } catch {
      status.textContent = words.error;
      return false;
    }
  }
  function renderViews() {
    const list = dialog.querySelector(".saved-places");
    list.replaceChildren();
    if (!views.length) {
      const p = document.createElement("p");
      p.textContent = words.empty;
      list.append(p);
    }
    views.forEach((v, i) => {
      const row = document.createElement("div");
      row.className = "saved-place";
      const label = document.createElement("span");
      label.textContent = `${v.name} · ${cities.find((c) => c.id === v.city).name}`;
      const open = document.createElement("button");
      open.type = "button";
      open.textContent = words.open;
      open.onclick = async () => {
        open.disabled = true;
        try {
          await switchCity(v.city);
          map.setView([v.lat, v.lng], v.zoom);
          const select = document.querySelector(".city-select");
          if (select) select.value = v.city;
          dialog.close();
        } finally {
          open.disabled = false;
        }
      };
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = words.remove;
      remove.setAttribute("aria-label", `${words.remove} ${v.name}`);
      remove.onclick = () => persist(views.filter((_, index) => index !== i));
      row.append(label, open, remove);
      list.append(row);
    });
  }
  dialog.querySelector("form").onsubmit = (e) => {
    e.preventDefault();
    const input = e.target.elements.name,
      name = input.value.trim();
    if (!name) return;
    if (views.length >= 10) {
      status.textContent = words.limit;
      return;
    }
    const center = map.getCenter();
    if (
      persist([
        ...views,
        {
          name,
          city: getCity(),
          lat: center.lat,
          lng: center.lng,
          zoom: map.getZoom(),
        },
      ])
    ) {
      input.value = "";
      status.textContent = words.saved;
    }
  };
  renderViews();
}
