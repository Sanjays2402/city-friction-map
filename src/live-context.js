import L from "leaflet";

export function initLiveContext({ map, getCity, spanish = false }) {
  const w = spanish
    ? {
        title: "Contexto en vivo",
        intro:
          "Datos públicos para la ciudad seleccionada. No son informes de la comunidad.",
        reload: "Actualizar",
        close: "Cerrar",
        loading: "Cargando…",
        unavailable: "Fuente temporalmente no disponible.",
        quake: "Terremotos regionales",
        tides: "Mareas previstas",
        sun: "Luz del día",
        empty: "No hay eventos M2.5+ a menos de 200 km en los últimos 7 días.",
        show: "Mostrar en el mapa",
        off: "Ocultar del mapa",
        high: "Alta",
        low: "Baja",
        rise: "Amanecer",
        set: "Atardecer",
        dusk: "Fin del crepúsculo",
        noTides: "No hay predicciones próximas.",
        fetched: "Consultado",
        local: "Hora local de la ciudad",
        note: "Mareas astronómicas previstas; no son niveles observados ni alertas de inundación.",
        regional:
          "Últimos 7 días · M2.5+ · radio de 200 km. Catálogo sísmico, no alerta de emergencia.",
      }
    : {
        title: "Live context",
        intro:
          "Public data for the selected city. Separate from community reports.",
        reload: "Refresh",
        close: "Close",
        loading: "Loading…",
        unavailable: "Source temporarily unavailable.",
        quake: "Regional earthquakes",
        tides: "Predicted tides",
        sun: "Daylight",
        empty: "No M2.5+ events within 200 km in the last 7 days.",
        show: "Show on map",
        off: "Hide from map",
        high: "High",
        low: "Low",
        rise: "Sunrise",
        set: "Sunset",
        dusk: "End of twilight",
        noTides: "No upcoming predictions returned.",
        fetched: "Fetched",
        local: "City-local time",
        note: "Astronomical tide predictions, not observed water levels or flood alerts.",
        regional:
          "Past 7 days · M2.5+ · within 200 km. Earthquake catalog, not an emergency alert.",
      };
  const launch = document.createElement("button");
  launch.className = "preference";
  launch.id = "live-context";
  launch.textContent = `◉ ${w.title}`;
  document.querySelector(".personal-bar").prepend(launch);
  const dialog = document.createElement("dialog");
  dialog.id = "context-dialog";
  dialog.setAttribute("aria-labelledby", "context-title");
  dialog.innerHTML = `<button class="close" type="button" aria-label="${w.close}">×</button><div class="eyebrow">OPEN DATA / CITY FRICTION</div><h2 id="context-title">${w.title}</h2><p>${w.intro}</p><p class="context-city"></p><button id="context-refresh" class="preference">${w.reload}</button><div class="context-grid" aria-live="polite"></div>`;
  document.body.append(dialog);
  const layer = L.layerGroup().addTo(map);
  let generation = 0,
    lastLoaded = 0;
  const time = (value, zone) =>
    new Intl.DateTimeFormat(spanish ? "es" : "en", {
      timeZone: zone,
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(value));
  const line = (parent, value, tag = "p") => {
    const el = document.createElement(tag);
    el.textContent = value;
    parent.append(el);
    return el;
  };
  function renderData(card, kind, data) {
    if (!data.available) {
      line(card, w.unavailable);
      return;
    }
    line(
      card,
      `${w.fetched}: ${time(data.fetchedAt, data.timeZone)} · ${w.local}`,
      "small",
    );
    if (kind === "daylight") {
      line(card, data.date, "strong");
      for (const [key, label] of [
        ["sunrise", w.rise],
        ["sunset", w.set],
        ["dusk", w.dusk],
      ])
        if (data[key])
          line(card, `${label} · ${time(data[key], data.timeZone)}`);
    } else if (kind === "tides") {
      line(card, `${data.stationName} · ${data.station}`, "strong");
      line(card, w.note);
      const future = data.predictions
        .filter((p) => Date.parse(p.time) > Date.now())
        .slice(0, 6);
      if (!future.length) line(card, w.noTides);
      future.forEach((p) =>
        line(
          card,
          `${p.type === "H" ? w.high : w.low} · ${time(p.time, data.timeZone)} · ${p.heightM.toFixed(2)} m MLLW`,
        ),
      );
    } else {
      line(card, w.regional);
      if (!data.events.length) line(card, w.empty);
      else {
        const button = document.createElement("button");
        button.className = "preference";
        button.textContent = w.show;
        button.setAttribute("aria-pressed", "false");
        card.append(button);
        button.onclick = () => {
          const showing = button.getAttribute("aria-pressed") === "true";
          layer.clearLayers();
          if (!showing) {
            data.events.forEach((e) => {
              const popup = document.createElement("div");
              line(popup, `M${e.magnitude} · ${e.place}`, "strong");
              line(popup, time(e.time, data.timeZone));
              const a = document.createElement("a");
              a.href = e.url;
              a.textContent = "USGS";
              a.target = "_blank";
              a.rel = "noopener noreferrer";
              popup.append(a);
              L.circleMarker([e.lat, e.lng], {
                radius: Math.max(6, Math.min(16, e.magnitude * 3)),
                color: "#c75943",
                weight: 2,
                fillOpacity: 0.5,
              })
                .bindPopup(popup)
                .addTo(layer);
            });
            map.fitBounds(
              data.events.map((e) => [e.lat, e.lng]),
              { padding: [40, 40], maxZoom: 11 },
            );
            dialog.close();
          }
          button.textContent = showing ? w.show : w.off;
          button.setAttribute("aria-pressed", String(!showing));
        };
        data.events
          .slice(0, 5)
          .forEach((e) =>
            line(
              card,
              `M${e.magnitude} · ${e.place} · ${e.distanceKm} km · ${time(e.time, data.timeZone)}`,
            ),
          );
      }
    }
  }
  async function refresh() {
    const token = ++generation,
      city = getCity(),
      grid = dialog.querySelector(".context-grid");
    grid.replaceChildren();
    layer.clearLayers();
    dialog.querySelector(".context-city").textContent = city.name;
    await Promise.all(
      [
        ["daylight", w.sun],
        ["tides", w.tides],
        ["earthquakes", w.quake],
      ].map(async ([kind, title]) => {
        const card = document.createElement("section");
        card.className = "context-card";
        card.dataset.source = kind;
        line(card, title, "h3");
        line(card, w.loading);
        grid.append(card);
        try {
          const response = await fetch(
            `/api/context/${kind}?city=${encodeURIComponent(city.id)}`,
            { signal: AbortSignal.timeout(10000) },
          );
          if (!response.ok) throw Error();
          const data = await response.json();
          if (token !== generation) return;
          card.replaceChildren();
          line(card, title, "h3");
          renderData(card, kind, data);
          if (data.source) {
            const a = document.createElement("a");
            a.href = data.source.url;
            a.target = "_blank";
            a.rel = "noopener noreferrer";
            a.textContent = data.source.name;
            card.append(a);
          }
        } catch {
          if (token === generation) {
            card.replaceChildren();
            line(card, title, "h3");
            line(card, w.unavailable);
          }
        }
      }),
    );
    if (token === generation) lastLoaded = Date.now();
  }
  launch.onclick = () => {
    dialog.showModal();
    if (!lastLoaded || Date.now() - lastLoaded > 300000) refresh();
  };
  dialog.querySelector(".close").onclick = () => dialog.close();
  dialog.querySelector("#context-refresh").onclick = refresh;
  return {
    cityChanged() {
      generation++;
      lastLoaded = 0;
      layer.clearLayers();
      if (dialog.open) refresh();
    },
  };
}
