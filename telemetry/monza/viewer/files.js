// Portable comparisons contain numeric telemetry and view state; videos stay on the device.
function comparisonSnapshot() {
  return {
    format: "driving-notes-comparison",
    version: 1,
    title: $("reportTitle").textContent,
    laps: structuredClone(laps),
    view: {
      min: state.min,
      max: state.max,
      offset: state.offset,
      referenceOffset: state.referenceOffset,
      cursor: state.cursor,
      cursorLocked: state.cursorLocked,
      active: state.active,
      lapVisible: [...state.lapVisible],
    },
    channels: channels.map(({ id, center, span, visible }) => ({
      id,
      center,
      span,
      visible,
    })),
    videos: structuredClone(videoBindings),
  };
}
function validateLap(input, index) {
  if (!input || !Array.isArray(input.rows) || input.rows.length < 2)
    throw Error("Ogni giro deve contenere almeno due campioni.");
  let last = -Infinity,
    lastVideo = -Infinity;
  const rows = input.rows.map((r, j) => {
    if (
      !Array.isArray(r) ||
      r.length !== 8 ||
      !Number.isInteger(r[0]) ||
      r[0] < 0 ||
      !Number.isFinite(r[1]) ||
      !Number.isFinite(r[2]) ||
      r[1] < 0 ||
      r[2] < 0 ||
      r[2] < last ||
      r[1] < lastVideo ||
      r.slice(3).some((v) => v !== null && !Number.isFinite(v))
    )
      throw Error(`Campione ${j + 1} del giro ${index + 1} non valido.`);
    last = r[2];
    lastVideo = r[1];
    return [...r];
  });
  const duration = input.duration ?? rows.at(-1)[2],
    sourceStart = input.sourceStart ?? rows[0][1] - rows[0][2];
  if (
    !Number.isFinite(duration) ||
    duration <= 0 ||
    duration < rows.at(-1)[2] ||
    !Number.isFinite(sourceStart)
  )
    throw Error("Durata o inizio video non valido.");
  return {
    name:
      typeof input.name === "string" && input.name.trim()
        ? input.name.slice(0, 100)
        : `Giro ${index + 1}`,
    duration,
    sourceStart,
    rows,
  };
}
function parseCSV(text) {
  text = text.replace(/^\uFEFF/, "");
  const header = text.split(/\r?\n/, 1)[0],
    delimiter = header.includes(";") ? ";" : ",";
  const rows = [];
  let row = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((v) => v.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }
  if (quoted) throw Error("Virgolette CSV non chiuse.");
  row.push(cell);
  if (row.some((v) => v.trim())) rows.push(row);
  if (rows.length < 3)
    throw Error("Il CSV deve contenere intestazioni e almeno due campioni.");
  const names = rows.shift().map((v) => v.trim().toLowerCase()),
    columns = [
      "speed_kmh",
      "engine_rpm",
      "gear",
      "throttle_pct_est",
      "brake_pct_est",
    ],
    timeKey = ["lap_elapsed_s_est", "lap_time_s", "time_s", "timestamp_s"].find(
      (k) => names.includes(k),
    );
  if (!timeKey || !columns.some((k) => names.includes(k)))
    throw Error(
      "CSV: serve una colonna del tempo (lap_elapsed_s_est o time_s) e almeno un canale riconosciuto.",
    );
  if (new Set(names).size !== names.length)
    throw Error("Il CSV contiene intestazioni duplicate.");
  const number = (r, key, fallback = null) => {
    const ix = names.indexOf(key);
    if (ix < 0 || r[ix]?.trim() === "" || r[ix] === undefined) return fallback;
    const v = Number(r[ix].trim().replace(",", "."));
    if (!Number.isFinite(v))
      throw Error(`Valore non numerico nella colonna ${key}.`);
    return v;
  };
  const string = (r, key) => r[names.indexOf(key)]?.trim();
  const groups = new Map();
  for (const r of rows) {
    if (r.length !== names.length)
      throw Error(
        "Una riga CSV ha un numero di colonne diverso dalle intestazioni.",
      );
    const id = string(r, "video_id") || string(r, "lap_id") || "giro";
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(r);
  }
  if (groups.size > 2) throw Error("Apri al massimo due giri per confronto.");
  const imported = [],
    shifts = [];
  for (const [id, group] of groups) {
    const data = group.map((r, j) => {
      const t = number(r, timeKey);
      return [
        number(r, "frame_index", j),
        number(r, "video_time_s", t),
        t,
        ...columns.map((k) => number(r, k)),
      ];
    });
    const offsets = data.map((r) => r[1] - r[2]).sort((a, b) => a - b);
    const sourceStart = offsets[Math.floor(offsets.length / 2)];
    imported.push({
      name: string(group[0], "dataset_name") || id,
      duration: data.at(-1)[2],
      sourceStart,
      rows: data,
    });
    shifts.push(number(group[0], "aligned_time_s", data[0][2]) - data[0][2]);
  }
  return {
    laps: imported,
    view:
      imported.length === 2
        ? { referenceOffset: shifts[0], offset: shifts[1] - shifts[0] }
        : null,
  };
}
function detachVideo(i) {
  const key = i ? "B" : "A",
    video = $("video" + key);
  video.pause();
  if (sourceURLs[key]) URL.revokeObjectURL(sourceURLs[key]);
  delete sourceURLs[key];
  pendingSeeks[i] = null;
  video.removeAttribute("src");
  video.load();
  $("file" + key).value = "";
}
function updateDatasetLabels() {
  const duration = (value) =>
    `${Math.floor(value / 60)}:${(value % 60).toFixed(2).padStart(5, "0")}`;
  for (let i = 0; i < 2; i++) {
    const key = i ? "B" : "A";
    $("lapName" + key).textContent = laps[i].name;
    $("lapDuration" + key).textContent = duration(laps[i].duration);
    $("videoName" + key).textContent =
      `Video ${i ? "arancione" : "blu"} · ${laps[i].name}`;
  }
  $("dataSummary").textContent =
    `Confronto locale · ${laps.reduce((n, lap) => n + lap.rows.length, 0).toLocaleString("it-IT")} campioni · Nessuna interpolazione delle letture mancanti.`;
}
function restoreComparison(
  input,
  { target = 1, label = "Dati importati" } = {},
) {
  if (
    input?.format &&
    (input.format !== "driving-notes-comparison" || input.version !== 1)
  )
    throw Error("Formato o versione del confronto non supportato.");
  const incoming = Array.isArray(input?.laps)
    ? input.laps
    : input?.rows
      ? [input]
      : null;
  if (!incoming || incoming.length < 1 || incoming.length > 2)
    throw Error("Il JSON deve contenere uno o due giri con rows.");
  const validated = incoming.map(validateLap),
    single = validated.length === 1,
    view = single ? null : input.view;
  if (
    view &&
    ["min", "max", "offset", "referenceOffset", "cursor"].some(
      (k) =>
        view[k] !== undefined &&
        (!Number.isFinite(view[k]) || Math.abs(view[k]) > 1e7),
    )
  )
    throw Error("Lo stato del confronto contiene valori non validi.");
  if (
    view &&
    ((view.min !== undefined &&
      view.max !== undefined &&
      view.max <= view.min) ||
      Math.abs(view.offset ?? 0) > 1e7 ||
      Math.abs(view.referenceOffset ?? 0) > 1e7)
  )
    throw Error("Intervallo o allineamento salvato non valido.");
  const layout = [];
  if (!single && input.channels !== undefined) {
    if (!Array.isArray(input.channels))
      throw Error("Disposizione dei canali non valida.");
    for (const c of input.channels) {
      if (
        !c ||
        !channels.some((ch) => ch.id === c.id) ||
        !Number.isFinite(c.center) ||
        !Number.isFinite(c.span) ||
        c.center < -1 ||
        c.center > 2 ||
        c.span < 0.05 ||
        c.span > 2.8
      )
        throw Error("Scala del canale salvato non valida.");
      layout.push({
        id: c.id,
        center: c.center,
        span: c.span,
        visible: c.visible !== false,
      });
    }
  }
  // All validation precedes mutations so a rejected file leaves the current comparison intact.
  state.drag = null;
  for (const i of single ? [target] : [0, 1]) {
    detachVideo(i);
    videoBindings[i] = null;
  }
  if (single) {
    laps[target] = validated[0];
    if (target === 0) {
      const orange = lapShift(1);
      state.referenceOffset = 0;
      state.offset = orange;
    } else state.offset = -state.referenceOffset;
  } else {
    laps.splice(0, 2, ...validated);
    state.referenceOffset = view?.referenceOffset ?? 0;
    state.offset = view?.offset ?? 0;
    if (layout.length)
      layout.forEach((c) =>
        Object.assign(
          channels.find((ch) => ch.id === c.id),
          c,
        ),
      );
    state.active = channels.some((c) => c.id === view?.active)
      ? view.active
      : "speed";
    state.lapVisible =
      Array.isArray(view?.lapVisible) && view.lapVisible.length === 2
        ? view.lapVisible.map((v) => v !== false)
        : [true, true];
    if (Array.isArray(input.videos))
      input.videos.slice(0, 2).forEach((v, i) => {
        videoBindings[i] =
          v && typeof v.name === "string"
            ? {
                name: v.name.slice(0, 250),
                size: Number.isFinite(v.size) ? v.size : null,
                lastModified: Number.isFinite(v.lastModified)
                  ? v.lastModified
                  : null,
              }
            : null;
      });
  }
  state.cursorLocked = !single && view?.cursorLocked === true;
  state.cursor = !single && view?.cursor !== undefined ? view.cursor : 0;
  $("reportTitle").textContent =
    typeof input.title === "string"
      ? input.title.slice(0, 150)
      : "Confronto telemetria";
  $("lapA").checked = state.lapVisible[0];
  $("lapB").checked = state.lapVisible[1];
  setMode("zoom");
  fullView();
  if (!single && view?.min !== undefined && view?.max !== undefined) {
    state.min = view.min;
    state.max = view.max;
  }
  updateControls();
  updateDatasetLabels();
  updateAlignmentStatus();
  updateVideoNote();
  remember();
  schedule();
  $("dataStatus").textContent =
    `${label}: ${validated.reduce((n, l) => n + l.rows.length, 0).toLocaleString("it-IT")} campioni caricati. Seleziona nuovamente i video necessari.`;
}
$("saveSession").onclick = () =>
  download(
    new Blob([JSON.stringify(comparisonSnapshot(), null, 2)], {
      type: "application/json",
    }),
    "confronto-telemetria.json",
  );
$("openData").onclick = () => {
  $("dataDetails").open = true;
  $("dataDetails").scrollIntoView({ block: "start", behavior: "smooth" });
};
$("dataDetails").addEventListener("toggle", () =>
  $("openData").setAttribute("aria-expanded", String($("dataDetails").open)),
);
$("openDataFile").onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    if (file.size > 32 * 1024 * 1024) throw Error("Il file supera 32 MB.");
    const text = await file.text(),
      input = file.name.toLowerCase().endsWith(".csv")
        ? parseCSV(text)
        : JSON.parse(text);
    restoreComparison(input, {
      target: Number($("importTarget").value),
      label: file.name,
    });
  } catch (error) {
    $("dataStatus").textContent = "File non aperto: " + error.message;
  } finally {
    e.target.value = "";
  }
};
$("resetData").onclick = () => {
  restoreComparison(
    {
      title: "Monza, due giri a confronto.",
      laps: DATA.laps,
      channels: channels.map((ch) => ({
        id: ch.id,
        ...ch.defaults,
        visible: true,
      })),
    },
    { label: "Dati Monza" },
  );
};
Object.assign(window.monzaViewer, {
  comparisonSnapshot,
  restoreComparison,
  parseCSV,
});
updateDatasetLabels();
