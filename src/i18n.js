// Internationalization: English + Spanish UI strings for the main chrome.
// Category labels come from server/domain.js and are intentionally not
// duplicated here.
const en = {
  header: {
    brandAria: "City Friction home",
    navExplore: "Explore the city",
    about: "How it works ↗",
    profileAria: "Your contributor profile",
    newcomer: "Newcomer",
    report: "＋ Report friction",
  },
  hero: {
    eyebrow: "A LITTLE LOCAL KNOWLEDGE GOES A LONG WAY",
    titleA: "Less friction.",
    titleB: "More city.",
    subtitle: "The little things between you and a good day. See them coming.",
    city: "San Francisco",
    demo: "Community map · Demo enabled",
    community: "Community map · Includes demo data",
    shared: "Community map · Shared reports",
  },
  toolbar: {
    filtersAria: "Map filters",
    searchPlaceholder: "Search a place or a problem…",
    searchAria: "Search reports",
    all: "All friction",
  },
  summary: {
    active: "Active heads-ups",
    major: "Major obstacles",
    stale: "Need a fresh update",
    resolved: "Community cleared",
    citywideDemo: "Citywide · includes demo data",
    citywideCommunity: "Citywide · community reports only",
  },
  list: {
    title: "Around the neighborhood",
    loading: "Loading reports…",
    live: "● LIVE",
    tabNow: "Happening now",
    tabCleared: "Cleared",
    tabStale: "Gone quiet",
    footer: "↗ Small updates. Smoother days.",
    countActive: "{count} active heads-ups · all mapped areas",
    countCleared: "{count} cleared reports · all mapped areas",
    countStale: "{count} quiet reports · confirm one to bring it back",
    countError: "Could not load reports.",
  },
  empty: {
    savedTitle: "Keep useful updates close.",
    savedHint: "Open any report and save it to find it here.",
    followedTitle: "Nothing you're following here.",
    followedHint: "Follow a report to get notified when neighbors update it.",
    defaultTitle: "A little breathing room.",
    defaultHint: "No reports match these filters.",
    reset: "Reset filters",
  },
  card: {
    cleared: "✓ Cleared",
    confirmations: "{count} confirmations",
    photoTitle: "Has a photo",
    newUpdates: "New updates on a report you follow",
    demo: "DEMO",
    stale: "STALE",
    distanceM: "{n} m",
    distanceKm: "{n} km",
  },
  map: {
    aria: "Map of San Francisco friction reports",
    note: "The city, with a little more context.",
    ariaLabel: "Map of {city} friction reports",
    locate: "Show my location",
    legendReported: "● Community reported",
    legendDisclaimer: "Estimates, not guarantees",
  },
  heat: {
    windowLabel: "Heat window",
    all: "All time",
    day: "Last 24 hours",
    week: "Last 7 days",
  },
  cta: {
    title: "Your two-second update could save someone twenty minutes.",
    body: "Spotted something? Put it on the map.",
    button: "Share a heads-up ↗",
  },
  footer: {
    tagline: "Built for the everyday in-between.",
    connecting: "Connecting…",
    updated: "Updated {age} · refreshes every 15s",
    connectionLost: "Connection lost · retrying automatically",
  },
  controls: {
    prefsAria: "Report preferences",
    saved: "☆ Saved reports",
    followed: "🔔 Followed",
    alertZones: "⚐ Alert zones",
    drawZone: "◯ Draw zone",
    tripCheck: "🛣 Trip check",
    heatmap: "🔥 Heatmap",
    bikeDocks: "🚲 Bike docks",
    cases311: "📋 311 cases",
    weatherAlerts: "⚠ Weather alerts",
    topNeighbors: "🏆 Top neighbors",
    moderation: "🛡 Moderation",
    trends: "📊 Trends",
    thisArea: "🗺 This area",
    majorOnly: "Major impact only",
    hideDemo: "Hide demo reports",
    exportCsv: "⭳ Export CSV",
    exportGeojson: "⭳ GeoJSON",
    importGeojson: "⭳ Import",
    layerOpacity: "Layer opacity",
    sortBy: "Sort by",
    sortRecent: "Latest update",
    sortImpact: "Highest impact",
    sortConfirmed: "Most confirmed",
    sortNearby: "📍 Near me",
    age: "Updated",
    ageAny: "Any time",
    ageHour: "Past hour",
    ageDay: "Past 24 hours",
    ageWeek: "Past 7 days",
  },
  alerts: {
    panelTitle: "⚐ Your alert zones",
    activeNearby: "{n} active nearby",
    deleteAria: "Delete alert zone {label}",
    radiusM: "{n} m radius",
    radiusKm: "{n} km radius",
  },
  trip: {
    title: "🛣 Trip check",
    clear: "Clear route",
    hintStart:
      "Click the map to drop route stops — two or more draw your route. Drag stops to fine-tune.",
    hintRoute:
      "{stops} stops · {hits} friction report{s} within {w} m of your route. Drag stops to adjust.",
    widthLabel: "Corridor width",
    widthM: "{n} m",
    clearCorridor: "Clear corridor — nothing reported along this route.",
    stopTooltip: "Stop {n} · drag to move",
  },
  layers: {
    filterLabel: "311 types:",
    clearFilter: "Clear filter",
  },
  detail: {
    closeAria: "Close report details",
    demoSuffix: " · FICTIONAL DEMO",
    photoAlt: "Photo attached to this report",
    photoZoom: "View photo full size",
    hiddenNotice: "⚑ Hidden after community flags. Under review.",
    estimateTitle: "Estimated time to clear",
    cleared: "Cleared",
    confidence: "{label} confidence",
    metaLine:
      "Category-based estimate · {confirmations} confirmations · {votes}/2 clearance votes",
    voteConfirm: "Still here +1",
    voteClear: "✓ Looks clear",
    resolve: "✓ Mark resolved",
    edit: "✎ Edit",
    stillThere: "Still there +1",
    staleNotice:
      "No updates in 30 days — this report went quiet. Passed by recently? Confirm it to bring it back.",
    communityCleared: "✓ The community marked this cleared.",
    saveOn: "★ Saved",
    saveOff: "☆ Save report",
    followOn: "🔔 Following",
    followOff: "🔔 Follow updates",
    flag: "⚑ Flag",
    forward: "🏛 Forward to 311",
    share: "Copy report link ↗",
    severity1: "Minor inconvenience",
    severity2: "Moderate impact",
    severity3: "Major obstacle",
    firstReported: "· First reported {age}",
    notesTitle: "Neighbor notes",
    notesLoading: "Loading notes…",
    notesEmpty: "No notes yet. Passed by here? Leave one for the next person.",
    notesError: "Could not load notes.",
    notePlaceholder: "Add a useful note for neighbors…",
    noteAria: "Add a neighbor note",
    post: "Post",
    helpful: "👍 Helpful",
    helpfulCount: "👍 Helpful ({count})",
    replyButton: "↩ Reply",
    replyPlaceholder: "Write a reply…",
    replyAria: "Write a reply",
    replySubmit: "Reply",
  },
  popup: {
    flagOne: "⚑ 1 flag",
    flagsMany: "⚑ {n} flags",
    reportDocks: "Report empty docks here",
    addCase: "Add as friction report",
    stationAvailability: "{bikes} bikes · {docks} docks open",
    stationEbikes: " · {n} e-bikes",
    caseSummary: "From a {city} 311 {status} case opened {date}.",
    caseDateUnknown: "an unknown date",
    weatherNow: "{city} now: {temp}°C, {label}",
    weatherAqi: " · AQI {aqi} {label}",
    weatherTitle: "Live {city} weather · wind {wind} km/h",
    weatherPm25: " · PM2.5 {pm25} µg/m³",
    nwsAlert: "⚠ {event}{more}",
    nwsAreaNote: "Covers the {city} area",
    prefillEmptyDocks: "Empty docks at {name}",
  },
  dialogs: {
    report: {
      eyebrow: "GOOD NEIGHBORS LEAVE A HEADS-UP",
      closeAria: "Close report form",
      title: "What’s slowing things down?",
      intro: "Choose a spot on the map first, or enter its coordinates below.",
      typeLabel: "Type of friction",
      headlineLabel: "Short headline",
      headlinePh: "e.g. Sidewalk blocked by roadwork",
      locationLabel: "Place or intersection",
      locationPh: "e.g. Market & 8th Street",
      latLabel: "Latitude",
      lngLabel: "Longitude",
      impactLabel: "Impact",
      impactMinor: "Minor · a little inconvenient",
      impactModerate: "Moderate · plan around it",
      impactMajor: "Major · significant obstacle",
      descriptionLabel: "Anything useful to know?",
      descriptionPh: "What would you tell a friend walking this way?",
      photoLabel: "Photo URL",
      optional: "(optional)",
      photoPh: "https://… a photo of the obstacle",
      formNote:
        "Similar reports within 90 meters may be merged. Reports are visible to everyone using this server.",
      submit: "Put it on the map ↗",
    },
    resolve: {
      eyebrow: "CLOSE THE LOOP",
      title: "Mark this resolved",
      intro:
        "Tell neighbors what changed. Everyone who confirmed this report will hear the good news.",
      noteLabel: "What changed? (optional)",
      notePh: "e.g. The elevator is back in service",
      submit: "Mark resolved ✓",
    },
    edit: {
      title: "Edit report",
      windowNote: "You can edit a report within 24 hours of filing it.",
      submit: "Save changes",
    },
    about: {
      eyebrow: "A SHARED PICTURE OF YOUR CITY",
      closeAria: "Close explanation",
      title: "Little reports. Real usefulness.",
      intro:
        "Report an obstacle, confirm it’s still there, or tell your neighbors it has cleared. Two independent browser clearance votes resolve an issue.",
      estimatesTitle: "How estimates work",
      estimatesBody:
        "Time ranges use category and impact, measured from the latest confirmation. They’re heuristic estimates, not trained forecasts. More confirmations improve the evidence label, but confidence is never a statistical probability.",
      honestTitle: "An honest starting point",
      honestBody:
        "Initial San Francisco reports are fictional and labeled DEMO. New reports are saved in SQLite and shared across connected browsers. Updates refresh every 15 seconds. Anonymous browser IDs prevent casual repeated votes, but are not identity verification.",
      shortcutsTitle: "Keyboard shortcuts",
      shortcutsBody:
        "/ search · ? this guide · f followed filter · Esc close dialogs and panels",
    },
    flag: {
      eyebrow: "KEEP THE MAP HONEST",
      closeAria: "Close flag form",
      title: "Why flag this report?",
      intro:
        "Three flags from different neighbors hide a report pending review. Flagging is anonymous.",
      reasonSpam: "Spam or advertising",
      reasonInaccurate: "Inaccurate or outdated",
      reasonInappropriate: "Inappropriate content",
      reasonDuplicate: "Duplicate report",
      submit: "Flag this report",
    },
    forward: {
      eyebrow: "TAKE IT TO THE CITY",
      title: "Forward to 311",
      intro:
        "Copy this summary and paste it into your city's 311 request form. It captures what neighbors have confirmed so far.",
      summaryLabel: "Summary to send",
      copy: "Copy summary",
      lineIssue: "Issue: {title}",
      lineCategory: "Category: {label}",
      lineLocation: "Location: {location} ({coords})",
      lineDescription: "Details: {description}",
      lineCommunity:
        "Community: {confirmations} neighbors confirm it is still there, {clearVotes} say it is cleared",
      linePhoto: "Photo evidence attached to the original report.",
      lineLink: "Original report: {link}",
    },
    alert: {
      eyebrow: "NEVER MISS FRICTION AGAIN",
      closeAria: "Close alert form",
      title: "Watch this area",
      intro: "Get a heads-up when new friction appears inside the zone.",
      nameLabel: "Zone name",
      namePh: "e.g. My walk to work",
      radiusLabel: "Radius",
      r100: "100 m",
      r250: "250 m",
      r500: "500 m",
      r1km: "1 km",
      r25km: "2.5 km",
      r5km: "5 km",
      submit: "Watch this area",
    },
    leaders: {
      eyebrow: "THANK YOUR NEIGHBORS",
      closeAria: "Close top neighbors",
      title: "Top neighbors",
      loading: "Loading…",
      empty: "No contributions yet. Be the first to put one on the map!",
      error: "Could not load the leaderboard.",
      stats:
        "{score} pts · {reports} reports · {notes} notes · {confirmations} confirmations",
    },
    profile: {
      eyebrow: "YOUR CITY KARMA",
      closeAria: "Close profile",
      title: "Contributor profile",
      loading: "Loading…",
      error: "Could not load your profile.",
      streakLabel: "day streak",
      reportsLabel: "reports",
      confirmationsLabel: "confirmations",
      helpfulLabel: "helpful votes",
      kudosLabel: "thanks received",
      weeklyTitle: "Weekly challenge",
      badgesTitle: "Badges",
      badgesCount: "{earned}/{total}",
      nextLevel: "{n} XP to {icon} {name}",
      maxLevel: "Max level reached. Legend status. 🌟",
      chipTitle: "{xp} XP · {streak}-day streak · click for your profile",
    },
    trends: {
      eyebrow: "THE CITY, IN NUMBERS",
      closeAria: "Close trends",
      title: "Friction trends",
      intro: "New reports per day for the last 14 days, by category.",
      chartAria: "Bar chart of new reports per day",
      loading: "Loading…",
      error: "Could not load trends.",
      statActive: "Active",
      statResolved: "Cleared",
      statNotes: "Neighbor notes",
      statConfirmations: "Confirmations",
      statAvg: "Avg. time to clear",
    },
    import: {
      eyebrow: "BRING YOUR OWN DATA",
      closeAria: "Close import form",
      title: "Import GeoJSON",
      intro:
        "Choose a GeoJSON FeatureCollection of Point features. Each valid feature becomes a report; similar ones merge into existing reports.",
      fileLabel: "GeoJSON file",
      submit: "Import reports",
      reading: "Reading file…",
      importing: "Importing… {i}/{n}",
    },
  },
  toasts: {
    somethingWrong: "Something went wrong.",
    levelUp: "🎉 Level up! You're now {icon} {name}.",
    storageUnavailable:
      "Saved for this session. Browser storage is unavailable.",
    linkCopied: "Report link copied. It opens on this same server.",
    copyManually: "Copy the report link from your browser’s address bar.",
    forwardCopied:
      "311 summary copied. Paste it into your city’s 311 request form.",
    locating: "Finding your location…",
    locateFailed:
      "Couldn’t get your location. Check your browser’s location permission.",
    unfollowed: "Unfollowed. You won't get updates on this report.",
    following:
      "Following. We'll flag new confirmations, notes, and clearance votes.",
    notePosted: "Note posted. Thanks for the heads-up.",
    replyPosted: "Reply posted.",
    voteClear: "Thanks! Two clearance votes resolve an issue.",
    voteConfirm: "Thanks for keeping the neighborhood updated.",
    flagHidden: "Thanks — this report is now hidden pending review.",
    flagCount: "Thanks. That's flag {n} of 3 to hide it.",
    reportMerged: "Merged with a nearby report. Your confirmation was added.",
    reportPosted: "Your heads-up is on the map. Thank you!",
    resolved: "Marked resolved. Thanks for closing the loop!",
    edited: "Report updated.",
    locationSelected:
      "Location selected. Choose “Report friction” to add a heads-up.",
    centeredHome: "Map centered on your location.",
    locationUnavailable:
      "Location unavailable. Click the map to choose a spot.",
    geoUnavailable: "Geolocation is unavailable in this browser.",
    nothingToExport: "Nothing to export with these filters.",
    exportCsvOne: "Exported {n} report to CSV.",
    exportCsvMany: "Exported {n} reports to CSV.",
    exportGeojsonOne: "Exported {n} report as GeoJSON.",
    exportGeojsonMany: "Exported {n} reports as GeoJSON.",
    importFinished: "Import finished: {parts}.",
    importNothing: "nothing to import",
    importAdded: "{n} added",
    importMerged: "{n} merged into existing reports",
    importSkipped: "{n} skipped",
    importIssues: "First issues: {issues}",
    alertModeOn: "Alert mode: click the map to watch an area.",
    alertModeOff: "Alert mode off. Map clicks select a report location again.",
    zoneSaved: "Zone saved. We'll watch it for new friction.",
    zoneRemoved: "Alert zone removed.",
    drawModeOn:
      "Draw mode: press and drag on the map to size a zone. Esc cancels.",
    drawModeOff: "Draw mode off.",
    zoneTooSmall: "Zone too small — drag a wider circle to watch an area.",
    heatmapOn: "Heatmap on — brighter means more severe friction nearby.",
    heatmapError: "The heatmap could not load. Please try again.",
    heatmapAll: "Heatmap: all reports.",
    heatmapDay: "Heatmap: reports updated in the last 24 hours.",
    heatmapWeek: "Heatmap: reports updated in the last 7 days.",
    tripOn: "Trip check: click the map to drop route stops.",
    tripOff: "Trip check off.",
    weatherUnavailable: "Weather alert data is unavailable right now.",
    weatherAlertsOne: "{n} active weather alert shown.",
    weatherAlertsMany: "{n} active weather alerts shown.",
    bikesUnavailable: "Bike-share data is unavailable right now.",
    bikesOn:
      "{n} {network} stations — green has open docks, red is full. Click one to report.",
    casesUnavailable: "311 case data is unavailable right now.",
    casesOn:
      "{n} recent {city} 311 cases on the map — filter by type below, click one to add it as a report.",
    caseAdded: "311 case added as a friction report. Thanks!",
    caseLinked: "Linked to a nearby report — your confirmation was added.",
    sharedNotFound: "This shared report could not be found on this server.",
    followedUpdateOne: "🔔 {n} update on followed reports — {preview}{more}",
    followedUpdateMany: "🔔 {n} updates on followed reports — {preview}{more}",
    reportNotFound: "Could not load report.",
    queuedOffline:
      "You're offline — report saved on this device. It will sync automatically.",
    queueFailed: "Could not save the report offline. Please try again.",
    syncedOffline: "Synced {n} queued report{s} from offline.",
    offlineBadge: "offline · {n} queued",
    queuedBadge: "{n} queued",
  },
  photo: {
    uploadLabel: "Photo",
    uploadHint: "JPG, PNG, or WebP · compressed on your device · optional",
    previewAlt: "Photo preview",
    remove: "Remove",
    tooLarge:
      "That photo is too large even after compression. Try a smaller one.",
  },
  similar: {
    title: "Already reported nearby?",
    hint: "These look close to your pin — confirm one instead of filing a duplicate.",
    distance: "{m} m away",
    confirmInstead: "Same one → confirm",
    confirmedThanks: "Confirmed — thanks for checking first.",
  },
  kudos: {
    thank: "🙏 Thank",
    thanked: "🙏 Thanked",
    toastThanks: "Thanks sent to the reporter.",
    toastUnthanks: "Thanks removed.",
  },
  freshness: {
    new: "NEW",
  },
  timeline: {
    title: "Activity",
    created: "Reported {age}",
    confirmations: "{n} confirmations",
    kudos: "{n} thanks",
    comments: "{n} notes",
    clearedOn: "Cleared {age}",
    editedOn: "Edited {age}",
  },
  moderation: {
    eyebrow: "KEEP IT HONEST",
    title: "Flagged reports",
    needToken: "Enter the admin token to review flagged reports.",
    tokenLabel: "Admin token",
    tokenPh: "Paste the admin token",
    unlock: "Unlock queue",
    empty: "Nothing flagged. The neighborhood is behaving.",
    flags: "{n} flags",
    isHidden: "hidden",
    hide: "Hide",
    restore: "Restore",
    delete: "Delete",
    confirmDelete: "Delete this report permanently?",
    deleted: "Report deleted.",
    hidden: "Report hidden.",
    restored: "Report restored.",
    selectAria: "Select report",
    hideSelected: "Hide selected",
    restoreSelected: "Restore selected",
    mergeSelected: "Merge into →",
    mergeTargetPh: "Keep report ID…",
    noneSelected: "Select at least one report first.",
    mergeTargetInvalid:
      "Enter the ID of the report to keep (different from the selected ones).",
    confirmMerge:
      "Merge {n} report(s) into the kept report? This can't be undone.",
    merged: "{n} report(s) merged.",
    bulkHidden: "{n} report(s) hidden.",
    bulkRestored: "{n} report(s) restored.",
  },
  embed: {
    openFull: "Open full map ↗",
  },
};

const es = {
  header: {
    brandAria: "Inicio de City Friction",
    navExplore: "Explora la ciudad",
    about: "Cómo funciona ↗",
    profileAria: "Tu perfil de colaborador",
    newcomer: "Recién llegado",
    report: "＋ Reportar un obstáculo",
  },
  hero: {
    eyebrow: "UN POCO DE CONOCIMIENTO LOCAL LLEGA LEJOS",
    titleA: "Menos fricción.",
    titleB: "Más ciudad.",
    subtitle:
      "Esos pequeños detalles entre tú y un buen día. Anticípate a ellos.",
    city: "San Francisco",
    demo: "Mapa comunitario · Demostración activada",
    community: "Mapa comunitario · Incluye datos de demostración",
    shared: "Mapa comunitario · Reportes compartidos",
  },
  toolbar: {
    filtersAria: "Filtros del mapa",
    searchPlaceholder: "Busca un lugar o un problema…",
    searchAria: "Buscar reportes",
    all: "Toda la fricción",
  },
  summary: {
    active: "Avisos activos",
    major: "Obstáculos graves",
    stale: "Necesitan actualización",
    resolved: "Resueltos por la comunidad",
    citywideDemo: "Toda la ciudad · incluye datos de demostración",
    citywideCommunity: "Toda la ciudad · solo reportes de la comunidad",
  },
  list: {
    title: "Por el vecindario",
    loading: "Cargando reportes…",
    live: "● EN VIVO",
    tabNow: "Ocurriendo ahora",
    tabCleared: "Resueltos",
    tabStale: "En silencio",
    footer: "↗ Pequeñas actualizaciones. Días más tranquilos.",
    countActive: "{count} avisos activos · en todas las zonas del mapa",
    countCleared: "{count} reportes resueltos · en todas las zonas del mapa",
    countStale: "{count} reportes inactivos · confirma uno para reactivarlo",
    countError: "No se pudieron cargar los reportes.",
  },
  empty: {
    savedTitle: "Guarda las actualizaciones útiles.",
    savedHint: "Abre cualquier reporte y guárdalo para encontrarlo aquí.",
    followedTitle: "No sigues nada por aquí.",
    followedHint:
      "Sigue un reporte para recibir avisos cuando los vecinos lo actualicen.",
    defaultTitle: "Un poco de calma.",
    defaultHint: "Ningún reporte coincide con estos filtros.",
    reset: "Restablecer filtros",
  },
  card: {
    cleared: "✓ Resuelto",
    confirmations: "{count} confirmaciones",
    photoTitle: "Tiene foto",
    newUpdates: "Novedades en un reporte que sigues",
    demo: "DEMO",
    stale: "INACTIVO",
    distanceM: "{n} m",
    distanceKm: "{n} km",
  },
  map: {
    aria: "Mapa de reportes de fricción de San Francisco",
    note: "La ciudad, con un poco más de contexto.",
    ariaLabel: "Mapa de reportes de fricción de {city}",
    locate: "Mostrar mi ubicación",
    legendReported: "● Reportado por la comunidad",
    legendDisclaimer: "Estimaciones, no garantías",
  },
  heat: {
    windowLabel: "Ventana de calor",
    all: "Todo el tiempo",
    day: "Últimas 24 horas",
    week: "Últimos 7 días",
  },
  cta: {
    title:
      "Tu actualización de dos segundos podría ahorrarle veinte minutos a alguien.",
    body: "¿Viste algo? Ponlo en el mapa.",
    button: "Compartir un aviso ↗",
  },
  footer: {
    tagline: "Hecho para el día a día entre un lugar y otro.",
    connecting: "Conectando…",
    updated: "Actualizado {age} · se actualiza cada 15 s",
    connectionLost: "Conexión perdida · reintentando automáticamente",
  },
  controls: {
    prefsAria: "Preferencias de reportes",
    saved: "☆ Reportes guardados",
    followed: "🔔 Seguidos",
    alertZones: "⚐ Zonas de alerta",
    drawZone: "◯ Dibujar zona",
    tripCheck: "🛣 Revisar ruta",
    heatmap: "🔥 Mapa de calor",
    bikeDocks: "🚲 Estaciones de bicis",
    cases311: "📋 Casos 311",
    weatherAlerts: "⚠ Alertas meteorológicas",
    topNeighbors: "🏆 Mejores vecinos",
    moderation: "🛡 Moderación",
    trends: "📊 Tendencias",
    thisArea: "🗺 Esta área",
    majorOnly: "Solo impacto grave",
    hideDemo: "Ocultar reportes de demostración",
    exportCsv: "⭳ Exportar CSV",
    exportGeojson: "⭳ GeoJSON",
    importGeojson: "⭳ Importar",
    layerOpacity: "Opacidad de capas",
    sortBy: "Ordenar por",
    sortRecent: "Última actualización",
    sortImpact: "Mayor impacto",
    sortConfirmed: "Más confirmados",
    sortNearby: "📍 Cerca de mí",
    age: "Actualizado",
    ageAny: "Cualquiera",
    ageHour: "Última hora",
    ageDay: "Últimas 24 horas",
    ageWeek: "Últimos 7 días",
  },
  alerts: {
    panelTitle: "⚐ Tus zonas de alerta",
    activeNearby: "{n} activos cerca",
    deleteAria: "Eliminar zona de alerta {label}",
    radiusM: "radio de {n} m",
    radiusKm: "radio de {n} km",
  },
  trip: {
    title: "🛣 Revisar ruta",
    clear: "Borrar ruta",
    hintStart:
      "Toca el mapa para poner paradas — con dos o más se dibuja tu ruta. Arrastra las paradas para ajustar.",
    hintRoute:
      "{stops} paradas · {hits} reporte{s} de fricción a menos de {w} m de tu ruta. Arrastra las paradas para ajustar.",
    widthLabel: "Ancho del corredor",
    widthM: "{n} m",
    clearCorridor: "Corredor despejado — nada reportado en esta ruta.",
    stopTooltip: "Parada {n} · arrastra para mover",
  },
  layers: {
    filterLabel: "Tipos 311:",
    clearFilter: "Quitar filtro",
  },
  detail: {
    closeAria: "Cerrar detalles del reporte",
    demoSuffix: " · DEMOSTRACIÓN FICTICIA",
    photoAlt: "Foto adjunta a este reporte",
    photoZoom: "Ver foto en tamaño completo",
    hiddenNotice: "⚑ Oculto tras reportes de la comunidad. En revisión.",
    estimateTitle: "Tiempo estimado de resolución",
    cleared: "Resuelto",
    confidence: "confianza {label}",
    metaLine:
      "Estimación por categoría · {confirmations} confirmaciones · {votes}/2 votos de resolución",
    voteConfirm: "Sigue aquí +1",
    voteClear: "✓ Se ve despejado",
    resolve: "✓ Marcar resuelto",
    edit: "✎ Editar",
    stillThere: "Sigue ahí +1",
    staleNotice:
      "Sin novedades en 30 días — este reporte se silenció. ¿Pasaste por aquí hace poco? Confírmalo para reactivarlo.",
    communityCleared: "✓ La comunidad lo marcó como resuelto.",
    saveOn: "★ Guardado",
    saveOff: "☆ Guardar reporte",
    followOn: "🔔 Siguiendo",
    followOff: "🔔 Seguir actualizaciones",
    flag: "⚑ Reportar",
    forward: "🏛 Enviar al 311",
    share: "Copiar enlace del reporte ↗",
    severity1: "Molestia leve",
    severity2: "Impacto moderado",
    severity3: "Obstáculo grave",
    firstReported: "· Reportado por primera vez {age}",
    notesTitle: "Notas de vecinos",
    notesLoading: "Cargando notas…",
    notesEmpty:
      "Aún no hay notas. ¿Pasaste por aquí? Deja una para la próxima persona.",
    notesError: "No se pudieron cargar las notas.",
    notePlaceholder: "Agrega una nota útil para tus vecinos…",
    noteAria: "Agregar una nota de vecino",
    post: "Publicar",
    helpful: "👍 Útil",
    helpfulCount: "👍 Útil ({count})",
    replyButton: "↩ Responder",
    replyPlaceholder: "Escribe una respuesta…",
    replyAria: "Escribe una respuesta",
    replySubmit: "Responder",
  },
  popup: {
    flagOne: "⚑ 1 reporte",
    flagsMany: "⚑ {n} reportes",
    reportDocks: "Reportar docks vacíos aquí",
    addCase: "Agregar como reporte de fricción",
    stationAvailability: "{bikes} bicis · {docks} docks libres",
    stationEbikes: " · {n} e-bicis",
    caseSummary: "De un caso 311 de {city} {status} abierto el {date}.",
    caseDateUnknown: "una fecha desconocida",
    weatherNow: "{city} ahora: {temp}°C, {label}",
    weatherAqi: " · ICA {aqi} {label}",
    weatherTitle: "Clima en vivo de {city} · viento {wind} km/h",
    weatherPm25: " · PM2.5 {pm25} µg/m³",
    nwsAlert: "⚠ {event}{more}",
    nwsAreaNote: "Cubre el área de {city}",
    prefillEmptyDocks: "Docks vacíos en {name}",
  },
  dialogs: {
    report: {
      eyebrow: "LOS BUENOS VECINOS DEJAN UN AVISO",
      closeAria: "Cerrar formulario de reporte",
      title: "¿Qué está frenando las cosas?",
      intro:
        "Primero elige un punto en el mapa o ingresa sus coordenadas abajo.",
      typeLabel: "Tipo de fricción",
      headlineLabel: "Título breve",
      headlinePh: "p. ej. Acera bloqueada por obras",
      locationLabel: "Lugar o intersección",
      locationPh: "p. ej. Market y 8th Street",
      latLabel: "Latitud",
      lngLabel: "Longitud",
      impactLabel: "Impacto",
      impactMinor: "Leve · un poco incómodo",
      impactModerate: "Moderado · conviene rodearlo",
      impactMajor: "Grave · obstáculo importante",
      descriptionLabel: "¿Algo útil que debamos saber?",
      descriptionPh: "¿Qué le dirías a un amigo que pasa por aquí?",
      photoLabel: "URL de foto",
      optional: "(opcional)",
      photoPh: "https://… una foto del obstáculo",
      formNote:
        "Los reportes similares dentro de 90 metros pueden fusionarse. Los reportes son visibles para todos los que usan este servidor.",
      submit: "Ponerlo en el mapa ↗",
    },
    resolve: {
      eyebrow: "CERRAR EL CICLO",
      title: "Marcar como resuelto",
      intro:
        "Cuéntales a los vecinos qué cambió. Todos los que confirmaron este reporte recibirán la buena noticia.",
      noteLabel: "¿Qué cambió? (opcional)",
      notePh: "p. ej. El elevador volvió a funcionar",
      submit: "Marcar resuelto ✓",
    },
    edit: {
      title: "Editar reporte",
      windowNote:
        "Puedes editar un reporte dentro de las 24 horas de haberlo creado.",
      submit: "Guardar cambios",
    },
    about: {
      eyebrow: "UNA IMAGEN COMPARTIDA DE TU CIUDAD",
      closeAria: "Cerrar explicación",
      title: "Pequeños reportes. Utilidad real.",
      intro:
        "Reporta un obstáculo, confirma que sigue ahí o avisa a tus vecinos que ya se resolvió. Dos votos independientes de resolución desde el navegador cierran un caso.",
      estimatesTitle: "Cómo funcionan las estimaciones",
      estimatesBody:
        "Los rangos de tiempo usan la categoría y el impacto, medidos desde la última confirmación. Son estimaciones heurísticas, no pronósticos entrenados. Más confirmaciones mejoran la etiqueta de evidencia, pero la confianza nunca es una probabilidad estadística.",
      honestTitle: "Un punto de partida honesto",
      honestBody:
        "Los reportes iniciales de San Francisco son ficticios y están marcados como DEMO. Los nuevos reportes se guardan en SQLite y se comparten entre navegadores conectados. Las actualizaciones llegan cada 15 segundos. Los identificadores anónimos de navegador evitan votos repetidos casuales, pero no son verificación de identidad.",
      shortcutsTitle: "Atajos de teclado",
      shortcutsBody:
        "/ buscar · ? esta guía · f filtro de seguidos · Esc cerrar diálogos y paneles",
    },
    flag: {
      eyebrow: "MANTÉN EL MAPA HONESTO",
      closeAria: "Cerrar formulario de reporte",
      title: "¿Por qué reportar este aviso?",
      intro:
        "Tres reportes de distintos vecinos ocultan un aviso hasta su revisión. Reportar es anónimo.",
      reasonSpam: "Spam o publicidad",
      reasonInaccurate: "Inexacto o desactualizado",
      reasonInappropriate: "Contenido inapropiado",
      reasonDuplicate: "Reporte duplicado",
      submit: "Reportar este aviso",
    },
    forward: {
      eyebrow: "LLÉVALO A LA CIUDAD",
      title: "Enviar al 311",
      intro:
        "Copia este resumen y pégalo en el formulario 311 de tu ciudad. Incluye lo que los vecinos han confirmado hasta ahora.",
      summaryLabel: "Resumen para enviar",
      copy: "Copiar resumen",
      lineIssue: "Problema: {title}",
      lineCategory: "Categoría: {label}",
      lineLocation: "Ubicación: {location} ({coords})",
      lineDescription: "Detalles: {description}",
      lineCommunity:
        "Comunidad: {confirmations} vecinos confirman que sigue ahí, {clearVotes} dicen que se resolvió",
      linePhoto: "Foto de evidencia adjunta al reporte original.",
      lineLink: "Reporte original: {link}",
    },
    alert: {
      eyebrow: "NO TE PIERDAS NINGUNA FRICCIÓN",
      closeAria: "Cerrar formulario de alerta",
      title: "Vigilar esta zona",
      intro:
        "Recibe un aviso cuando aparezca fricción nueva dentro de la zona.",
      nameLabel: "Nombre de la zona",
      namePh: "p. ej. Mi camino al trabajo",
      radiusLabel: "Radio",
      r100: "100 m",
      r250: "250 m",
      r500: "500 m",
      r1km: "1 km",
      r25km: "2.5 km",
      r5km: "5 km",
      submit: "Vigilar esta zona",
    },
    leaders: {
      eyebrow: "AGRADECE A TUS VECINOS",
      closeAria: "Cerrar mejores vecinos",
      title: "Mejores vecinos",
      loading: "Cargando…",
      empty:
        "Aún no hay contribuciones. ¡Sé el primero en poner una en el mapa!",
      error: "No se pudo cargar la clasificación.",
      stats:
        "{score} pts · {reports} reportes · {notes} notas · {confirmations} confirmaciones",
    },
    profile: {
      eyebrow: "TU KARMA URBANO",
      closeAria: "Cerrar perfil",
      title: "Perfil de colaborador",
      loading: "Cargando…",
      error: "No se pudo cargar tu perfil.",
      streakLabel: "días de racha",
      reportsLabel: "reportes",
      confirmationsLabel: "confirmaciones",
      helpfulLabel: "votos útiles",
      kudosLabel: "gracias recibidos",
      weeklyTitle: "Reto semanal",
      badgesTitle: "Insignias",
      badgesCount: "{earned}/{total}",
      nextLevel: "{n} XP para {icon} {name}",
      maxLevel: "Nivel máximo alcanzado. Estatus de leyenda. 🌟",
      chipTitle: "{xp} XP · racha de {streak} días · clic para ver tu perfil",
    },
    trends: {
      eyebrow: "LA CIUDAD, EN NÚMEROS",
      closeAria: "Cerrar tendencias",
      title: "Tendencias de fricción",
      intro: "Nuevos reportes por día en los últimos 14 días, por categoría.",
      chartAria: "Gráfico de barras de nuevos reportes por día",
      loading: "Cargando…",
      error: "No se pudieron cargar las tendencias.",
      statActive: "Activos",
      statResolved: "Resueltos",
      statNotes: "Notas de vecinos",
      statConfirmations: "Confirmaciones",
      statAvg: "Tiempo prom. de resolución",
    },
    import: {
      eyebrow: "TRAE TUS PROPIOS DATOS",
      closeAria: "Cerrar formulario de importación",
      title: "Importar GeoJSON",
      intro:
        "Elige un FeatureCollection de GeoJSON con geometrías de tipo Point. Cada geometría válida se convierte en un reporte; las similares se fusionan con reportes existentes.",
      fileLabel: "Archivo GeoJSON",
      submit: "Importar reportes",
      reading: "Leyendo archivo…",
      importing: "Importando… {i}/{n}",
    },
  },
  toasts: {
    somethingWrong: "Algo salió mal.",
    levelUp: "🎉 ¡Subiste de nivel! Ahora eres {icon} {name}.",
    storageUnavailable:
      "Guardado solo para esta sesión. El almacenamiento del navegador no está disponible.",
    linkCopied: "Enlace del reporte copiado. Se abre en este mismo servidor.",
    copyManually: "Copia el enlace del reporte desde la barra de direcciones.",
    forwardCopied:
      "Resumen 311 copiado. Pégalo en el formulario 311 de tu ciudad.",
    locating: "Buscando tu ubicación…",
    locateFailed:
      "No pudimos obtener tu ubicación. Revisa el permiso de ubicación de tu navegador.",
    unfollowed:
      "Dejaste de seguirlo. No recibirás actualizaciones de este reporte.",
    following:
      "Siguiéndolo. Te avisaremos de nuevas confirmaciones, notas y votos de resolución.",
    notePosted: "Nota publicada. Gracias por el aviso.",
    replyPosted: "Respuesta publicada.",
    voteClear: "¡Gracias! Dos votos de resolución cierran un caso.",
    voteConfirm: "Gracias por mantener actualizado al vecindario.",
    flagHidden: "Gracias — este reporte quedó oculto hasta su revisión.",
    flagCount: "Gracias. Ese es el reporte {n} de 3 para ocultarlo.",
    reportMerged:
      "Fusionado con un reporte cercano. Se agregó tu confirmación.",
    reportPosted: "¡Tu aviso ya está en el mapa. Gracias!",
    resolved: "Marcado como resuelto. ¡Gracias por cerrar el ciclo!",
    edited: "Reporte actualizado.",
    locationSelected:
      "Ubicación seleccionada. Elige “Reportar un obstáculo” para agregar un aviso.",
    centeredHome: "Mapa centrado en tu ubicación.",
    locationUnavailable:
      "Ubicación no disponible. Toca el mapa para elegir un punto.",
    geoUnavailable: "La geolocalización no está disponible en este navegador.",
    nothingToExport: "Nada que exportar con estos filtros.",
    exportCsvOne: "Se exportó {n} reporte a CSV.",
    exportCsvMany: "Se exportaron {n} reportes a CSV.",
    exportGeojsonOne: "Se exportó {n} reporte como GeoJSON.",
    exportGeojsonMany: "Se exportaron {n} reportes como GeoJSON.",
    importFinished: "Importación terminada: {parts}.",
    importNothing: "nada que importar",
    importAdded: "{n} agregados",
    importMerged: "{n} fusionados con reportes existentes",
    importSkipped: "{n} omitidos",
    importIssues: "Primeros problemas: {issues}",
    alertModeOn: "Modo alerta: toca el mapa para vigilar una zona.",
    alertModeOff:
      "Modo alerta desactivado. Los toques en el mapa vuelven a elegir ubicación.",
    zoneSaved: "Zona guardada. La vigilaremos por ti.",
    zoneRemoved: "Zona de alerta eliminada.",
    drawModeOn:
      "Modo dibujo: presiona y arrastra en el mapa para dar tamaño a una zona. Esc cancela.",
    drawModeOff: "Modo dibujo desactivado.",
    zoneTooSmall:
      "Zona muy pequeña — arrastra un círculo más amplio para vigilar un área.",
    heatmapOn: "Mapa de calor activado — más brillo, más fricción cercana.",
    heatmapError: "No se pudo cargar el mapa de calor. Intenta de nuevo.",
    heatmapAll: "Mapa de calor: todos los reportes.",
    heatmapDay: "Mapa de calor: reportes actualizados en las últimas 24 horas.",
    heatmapWeek: "Mapa de calor: reportes actualizados en los últimos 7 días.",
    tripOn: "Revisar ruta: toca el mapa para poner paradas.",
    tripOff: "Revisión de ruta desactivada.",
    weatherUnavailable:
      "Los datos de alertas meteorológicas no están disponibles.",
    weatherAlertsOne: "{n} alerta meteorológica activa mostrada.",
    weatherAlertsMany: "{n} alertas meteorológicas activas mostradas.",
    bikesUnavailable: "Los datos de bicis compartidas no están disponibles.",
    bikesOn:
      "{n} estaciones de {network} — verde tiene docks libres, rojo está lleno. Toca una para reportar.",
    casesUnavailable: "Los datos de casos 311 no están disponibles.",
    casesOn:
      "{n} casos 311 recientes de {city} en el mapa — filtra por tipo abajo, toca uno para agregarlo como reporte.",
    caseAdded: "Caso 311 agregado como reporte de fricción. ¡Gracias!",
    caseLinked: "Vinculado a un reporte cercano — se agregó tu confirmación.",
    sharedNotFound: "Este reporte compartido no se encontró en este servidor.",
    followedUpdateOne:
      "🔔 {n} actualización en reportes seguidos — {preview}{more}",
    followedUpdateMany:
      "🔔 {n} actualizaciones en reportes seguidos — {preview}{more}",
    reportNotFound: "No se pudo cargar el reporte.",
    queuedOffline:
      "Sin conexión — reporte guardado en este dispositivo. Se sincronizará automáticamente.",
    queueFailed:
      "No se pudo guardar el reporte sin conexión. Inténtalo de nuevo.",
    syncedOffline: "Se sincronizaron {n} reporte{s} guardados sin conexión.",
    offlineBadge: "sin conexión · {n} en cola",
    queuedBadge: "{n} en cola",
  },
  photo: {
    uploadLabel: "Foto",
    uploadHint: "JPG, PNG o WebP · se comprime en tu dispositivo · opcional",
    previewAlt: "Vista previa de la foto",
    remove: "Quitar",
    tooLarge:
      "Esa foto es demasiado grande incluso comprimida. Prueba con una más pequeña.",
  },
  similar: {
    title: "¿Ya reportado cerca?",
    hint: "Estos parecen cercanos a tu punto — confirma uno en vez de duplicar.",
    distance: "a {m} m",
    confirmInstead: "Es el mismo → confirmar",
    confirmedThanks: "Confirmado — gracias por revisar primero.",
  },
  kudos: {
    thank: "🙏 Gracias",
    thanked: "🙏 Enviado",
    toastThanks: "Gracias enviadas al autor.",
    toastUnthanks: "Gracias retiradas.",
  },
  freshness: {
    new: "NUEVO",
  },
  timeline: {
    title: "Actividad",
    created: "Reportado {age}",
    confirmations: "{n} confirmaciones",
    kudos: "{n} gracias",
    comments: "{n} notas",
    clearedOn: "Resuelto {age}",
    editedOn: "Editado {age}",
  },
  moderation: {
    eyebrow: "MANTENER LA HONESTIDAD",
    title: "Reportes marcados",
    needToken:
      "Ingresa el token de administrador para revisar los reportes marcados.",
    tokenLabel: "Token de administrador",
    tokenPh: "Pega el token de administrador",
    unlock: "Desbloquear",
    empty: "Nada marcado. El vecindario se porta bien.",
    flags: "{n} marcas",
    isHidden: "oculto",
    hide: "Ocultar",
    restore: "Restaurar",
    delete: "Eliminar",
    confirmDelete: "¿Eliminar este reporte permanentemente?",
    deleted: "Reporte eliminado.",
    hidden: "Reporte ocultado.",
    restored: "Reporte restaurado.",
    selectAria: "Seleccionar reporte",
    hideSelected: "Ocultar seleccionados",
    restoreSelected: "Restaurar seleccionados",
    mergeSelected: "Fusionar en →",
    mergeTargetPh: "ID del reporte a conservar…",
    noneSelected: "Selecciona al menos un reporte primero.",
    mergeTargetInvalid:
      "Ingresa el ID del reporte a conservar (distinto de los seleccionados).",
    confirmMerge:
      "¿Fusionar {n} reporte(s) en el reporte conservado? Esto no se puede deshacer.",
    merged: "{n} reporte(s) fusionados.",
    bulkHidden: "{n} reporte(s) ocultados.",
    bulkRestored: "{n} reporte(s) restaurados.",
  },
  embed: {
    openFull: "Abrir mapa completo ↗",
  },
};

const STRINGS = { en, es };

export const SUPPORTED_LANGS = [
  { id: "en", label: "English" },
  { id: "es", label: "Español" },
];

// Raw dictionaries; exposed so tests can verify key parity (and so future
// tooling can enumerate strings without re-importing internals).
export { STRINGS };

const STORAGE_KEY = "friction-lang";

let current = "en";
try {
  const saved =
    typeof localStorage === "undefined"
      ? null
      : localStorage.getItem(STORAGE_KEY);
  if (saved === "en" || saved === "es") current = saved;
} catch {
  // Storage exists but is unreadable; fall back to English.
}

function lookup(obj, key) {
  let node = obj;
  for (const part of key.split(".")) {
    if (node === null || typeof node !== "object" || !(part in node))
      return undefined;
    node = node[part];
  }
  return typeof node === "string" ? node : undefined;
}

export function t(key, vars) {
  let value = lookup(STRINGS[current], key);
  if (value === undefined) value = lookup(STRINGS.en, key);
  if (value === undefined) return key;
  if (vars)
    value = value.replace(/\{(\w+)\}/g, (match, name) =>
      name in vars ? String(vars[name]) : match,
    );
  return value;
}

export function setLang(lang) {
  if (!(lang in STRINGS)) return false;
  current = lang;
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // Storage is unavailable; the language still applies for this session.
    }
  }
  return true;
}

export function currentLang() {
  return current;
}

export function applyI18n(root) {
  if (typeof document === "undefined") return;
  const scope = root || document;
  scope
    .querySelectorAll("[data-i18n]")
    .forEach((el) => (el.textContent = t(el.getAttribute("data-i18n"))));
  scope
    .querySelectorAll("[data-i18n-ph]")
    .forEach((el) =>
      el.setAttribute("placeholder", t(el.getAttribute("data-i18n-ph"))),
    );
  scope
    .querySelectorAll("[data-i18n-aria]")
    .forEach((el) =>
      el.setAttribute("aria-label", t(el.getAttribute("data-i18n-aria"))),
    );
}
