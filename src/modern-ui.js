// Keep the existing controls and event targets; group them without hiding tools.
export function initModernUI({ spanish = false } = {}) {
  const icons = {
    plus: '<path d="M12 5v14M5 12h14"/>',
    bookmark: '<path d="M6 4h12v17l-6-4-6 4Z"/>',
    bell: '<path d="M6 9a6 6 0 0 1 12 0c0 7 3 7 3 8H3c0-1 3-1 3-8M10 21h4"/>',
    map: '<path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2ZM9 3v16M15 5v16"/>',
    layers: '<path d="m12 3 9 5-9 5-9-5ZM3 12l9 5 9-5M3 16l9 5 9-5"/>',
    chart: '<path d="M4 4v16h16M8 15v-4M12 15V7M16 15v-6"/>',
    route:
      '<circle cx="5" cy="5" r="2"/><circle cx="19" cy="19" r="2"/><path d="M7 5h9a4 4 0 0 1 0 8H8a3 3 0 0 0 0 6h9"/>',
    circle: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>',
    shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6ZM8 12l3 3 5-6"/>',
    download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
    upload: '<path d="M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1M14 11a5 5 0 0 0-7.1 0l-2 2a5 5 0 0 0 7.1 7.1l1.1-1.1"/>',
    users:
      '<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 4v3"/>',
    sliders:
      '<path d="M4 7h16M4 17h16"/><circle cx="8" cy="7" r="2"/><circle cx="16" cy="17" r="2"/>',
  };
  const targets = {
    report: "plus",
    "report-here": "circle",
    "saved-toggle": "bookmark",
    "followed-toggle": "bell",
    "city-link": "link",
    "area-toggle": "map",
    "heat-toggle": "layers",
    "bikes-toggle": "circle",
    "cases-toggle": "layers",
    "sea-events-toggle": "route",
    "nws-toggle": "bell",
    "trip-toggle": "route",
    "alerts-toggle": "bell",
    "draw-toggle": "circle",
    trends: "chart",
    leaders: "users",
    moderation: "shield",
    "export-csv": "download",
    "export-geojson": "download",
    "import-geojson": "upload",
    "live-context": "circle",
    personalize: "sliders",
  };
  for (const [id, icon] of Object.entries(targets)) {
    const button = document.getElementById(id);
    if (!button) continue;
    const text = [...button.childNodes].find(
      (node) => node.nodeType === Node.TEXT_NODE,
    );
    if (text)
      text.textContent = text.textContent.replace(/^[^\p{L}\p{N}]+/u, "");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("class", "ui-icon");
    svg.innerHTML = icons[icon];
    button.prepend(svg);
    button.classList.add("with-icon");
  }
  const controls = document.querySelector(".discovery-controls");
  const original = controls.firstElementChild;
  const groups = [
    [
      spanish ? "Tu vista" : "Your view",
      [
        "saved-toggle",
        "followed-toggle",
        "city-link",
        "area-toggle",
        "major-only",
        "hide-demo",
        "stepfree-only",
      ],
    ],
    [
      spanish ? "Capas del mapa" : "Map layers",
      [
        "heat-toggle",
        "bikes-toggle",
        "cases-toggle",
        "sea-events-toggle",
        "nws-toggle",
        "layer-opacity",
      ],
    ],
    [
      spanish ? "Planifica y sigue" : "Plan & follow",
      ["trip-toggle", "alerts-toggle", "draw-toggle", "trends"],
    ],
    [
      spanish ? "Comunidad y datos" : "Community & data",
      [
        "leaders",
        "moderation",
        "export-csv",
        "export-geojson",
        "import-geojson",
      ],
    ],
  ];
  for (const [title, ids] of groups) {
    const group = document.createElement("div");
    group.className = "tool-group";
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", title);
    const heading = document.createElement("h3");
    heading.textContent = title;
    group.append(heading);
    for (const id of ids) {
      const control = document.getElementById(id);
      if (control) group.append(control.closest("label") || control);
    }
    original.append(group);
  }
  controls.id = "map-tools";
  controls.tabIndex = -1;
  controls.dataset.mobileCollapsed = "true";
  document.querySelector(".workspace").after(controls);
  const jump = document.createElement("button");
  jump.id = "tools-jump";
  jump.className = "preference";
  jump.setAttribute("aria-controls", "map-tools");
  const jumpLabel = spanish ? "Herramientas del mapa" : "Map tools";
  function syncJump() {
    const mobile = matchMedia("(max-width: 700px)").matches;
    const expanded = !mobile || controls.dataset.mobileCollapsed === "false";
    jump.textContent = `${expanded && mobile ? (spanish ? "Ocultar herramientas" : "Hide map tools") : jumpLabel} ${expanded && mobile ? "↑" : "↓"}`;
    jump.setAttribute("aria-expanded", String(expanded));
  }
  jump.onclick = () => {
    if (matchMedia("(max-width: 700px)").matches) {
      controls.dataset.mobileCollapsed =
        controls.dataset.mobileCollapsed === "true" ? "false" : "true";
      syncJump();
      if (controls.dataset.mobileCollapsed === "true") {
        jump.focus();
        return;
      }
    }
    controls.scrollIntoView({
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
      block: "center",
    });
    controls.focus({ preventScroll: true });
  };
  window.addEventListener("resize", syncJump);
  syncJump();
  document.querySelector(".personal-bar").prepend(jump);
  const bar = document.querySelector(".personal-bar");
  bar.after(
    document.querySelector("#layer-filters"),
    document.querySelector("#permit-panel"),
  );
}
