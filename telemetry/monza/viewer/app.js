"use strict";
const DATA = JSON.parse(document.getElementById("telemetry").textContent);
const $ = (id) => document.getElementById(id),
  COLORS = ["#1865dc", "#d86719"];
// Rows: original frame, source video timestamp, lap time, speed, rpm, gear, gas, brake.
const laps = DATA.laps;
const state = { min: 0, max: 94, offset: 0, cursor: 0, drag: null };
const measured = [[], []],
  calibrations = [null, null],
  bodyReferences = [null, null];
let drawing = null,
  pending = [],
  activeLine = null,
  demo = true,
  steerOrigin = 6,
  sourceURLs = {},
  measureId = 0;
const channels = [
  {
    name: "Velocità",
    unit: "km/h",
    col: 3,
    min: 40,
    max: 340,
    ticks: [50, 100, 150, 200, 250, 300],
    className: "speed",
  },
  {
    name: "Motore",
    unit: "RPM",
    col: 4,
    min: 3500,
    max: 9500,
    ticks: [4000, 6000, 8000],
  },
  {
    name: "Marcia",
    unit: "",
    col: 5,
    min: 0.5,
    max: 6.5,
    ticks: [1, 2, 3, 4, 5, 6],
    step: true,
  },
  {
    name: "Acceleratore · stima",
    unit: "%",
    col: 6,
    min: -5,
    max: 105,
    ticks: [0, 50, 100],
  },
  {
    name: "Freno · stima",
    unit: "%",
    col: 7,
    min: -5,
    max: 105,
    ticks: [0, 50, 100],
  },
  {
    name: "Sterzo · angolo apparente",
    unit: "°",
    steering: true,
    min: -180,
    max: 180,
    ticks: [-180, -90, 0, 90, 180],
    className: "steerPlot",
  },
];
function createPanel(ch) {
  const el = document.createElement("div");
  el.className = "chart " + (ch.className || "");
  el.innerHTML = `<div class="chartTop"><strong>${ch.name}${ch.unit ? " · " + ch.unit : ""}</strong><div class="values"><span class="blue">Blu: <b>—</b></span><span class="orange">Arancione: <b>—</b></span></div></div><canvas class="plot" aria-label="${ch.name}. Trascina per zoommare." tabindex="0"></canvas>`;
  (ch.steering ? $("steerChart") : $("charts")).append(el);
  ch.canvas = el.querySelector("canvas");
  ch.values = el.querySelectorAll("b");
  bindPlot(ch);
}
channels.forEach(createPanel);
function bounds() {
  return [
    Math.min(0, state.offset),
    Math.max(laps[0].duration, laps[1].duration + state.offset),
  ];
}
function setRange(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) {
    message(
      "Inserisci un intervallo valido: la fine deve essere maggiore dell’inizio.",
    );
    return false;
  }
  const [lo, hi] = bounds(),
    width = Math.min(hi - lo, Math.max(0.15, b - a));
  let low = Math.max(lo, Math.min(a, hi - width));
  state.min = low;
  state.max = low + width;
  state.cursor = Math.max(state.min, Math.min(state.max, state.cursor));
  updateRangeInputs();
  schedule();
  return true;
}
function updateRangeInputs() {
  $("rangeStart").value = state.min.toFixed(3);
  $("rangeEnd").value = state.max.toFixed(3);
}
function fullView() {
  const [a, b] = bounds();
  setRange(a, b);
}
function setOffset(v) {
  if (!Number.isFinite(v) || Math.abs(v) > 120) {
    message("Usa uno spostamento fra −120 e +120 secondi.");
    return false;
  }
  const old = bounds(),
    wasFull =
      Math.abs(state.min - old[0]) < 0.02 &&
      Math.abs(state.max - old[1]) < 0.02;
  state.offset = v;
  $("offset").value = v.toFixed(3);
  $("offsetSlider").value = Math.max(-5, Math.min(5, v));
  $("alignmentStatus").textContent =
    `Giro arancione: ${v >= 0 ? "+" : ""}${v.toFixed(3)} s. ${v === 0 ? "Partenze allineate dal cronometro HUD." : v > 0 ? "Spostato verso destra." : "Spostato verso sinistra."} Le durate dei giri restano invariate.`;
  if (wasFull) fullView();
  else setRange(state.min, state.max);
  schedule();
  return true;
}
function nearest(rows, time, index = 2) {
  let a = 0,
    b = rows.length;
  while (a < b) {
    const m = (a + b) >> 1;
    if (rows[m][index] < time) a = m + 1;
    else b = m;
  }
  if (a === 0) return rows[0];
  if (a === rows.length) return rows.at(-1);
  return Math.abs(rows[a][index] - time) < Math.abs(rows[a - 1][index] - time)
    ? rows[a]
    : rows[a - 1];
}
function nearestValue(lap, ch, x) {
  const t = x - (lap ? state.offset : 0);
  if (ch.steering) {
    const rows = measured[lap];
    if (!rows.length) return null;
    let closest = rows.reduce((a, b) =>
      Math.abs(a.lapTime - t) < Math.abs(b.lapTime - t) ? a : b,
    );
    return Math.abs(closest.lapTime - t) < 0.1 ? closest.angle : null;
  }
  if (t < 0 || t > laps[lap].duration) return null;
  const r = nearest(laps[lap].rows, t);
  return r && Math.abs(r[2] - t) < 0.12 ? r[ch.col] : null;
}
let scheduled = false;
function schedule() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    drawAll();
  });
}
function drawAll() {
  channels.forEach(draw);
  $("cursorReadout").textContent =
    `Cursore ${state.cursor.toFixed(3)} s · intervallo ${(state.max - state.min).toFixed(2)} s`;
}
function draw(ch) {
  const cv = ch.canvas,
    w = Math.max(300, cv.getBoundingClientRect().width),
    h = cv.getBoundingClientRect().height,
    dpr = window.devicePixelRatio || 1;
  cv.width = Math.round(w * dpr);
  cv.height = Math.round(h * dpr);
  const c = cv.getContext("2d");
  c.scale(dpr, dpr);
  c.clearRect(0, 0, w, h);
  c.fillStyle = "white";
  c.fillRect(0, 0, w, h);
  const g = { left: 49, right: w - 16, top: 15, bottom: h - 30 };
  cv._g = g;
  const X = (t) =>
      g.left + ((t - state.min) / (state.max - state.min)) * (g.right - g.left),
    Y = (v) =>
      g.bottom - ((v - ch.min) / (ch.max - ch.min)) * (g.bottom - g.top);
  c.font = "11px system-ui";
  c.textBaseline = "middle";
  c.lineWidth = 1;
  for (const v of ch.ticks) {
    c.strokeStyle = "#e7edf5";
    c.beginPath();
    c.moveTo(g.left, Y(v));
    c.lineTo(g.right, Y(v));
    c.stroke();
    c.fillStyle = "#6c7e96";
    c.textAlign = "right";
    c.fillText(v, g.left - 9, Y(v));
  }
  const span = state.max - state.min,
    rough = span / (w < 600 ? 5 : 9),
    pow = 10 ** Math.floor(Math.log10(rough)),
    tick =
      [1, 2, 5, 10].map((x) => x * pow).find((x) => x >= rough) || pow * 10;
  c.textAlign = "center";
  for (
    let t = Math.ceil(state.min / tick) * tick;
    t <= state.max + tick * 0.0001;
    t += tick
  ) {
    c.strokeStyle = "#e7edf5";
    c.beginPath();
    c.moveTo(X(t), g.top);
    c.lineTo(X(t), g.bottom);
    c.stroke();
    c.fillStyle = "#6c7e96";
    c.fillText(t.toFixed(tick < 1 ? 2 : tick < 5 ? 1 : 0) + " s", X(t), h - 12);
  }
  c.save();
  c.beginPath();
  c.rect(g.left, g.top, g.right - g.left, g.bottom - g.top);
  c.clip();
  for (let lap = 0; lap < 2; lap++) {
    const off = lap ? state.offset : 0;
    c.strokeStyle = COLORS[lap];
    c.fillStyle = COLORS[lap];
    c.lineWidth = 1.6;
    if (ch.steering) {
      for (const r of measured[lap]) {
        if (r.angle === null) continue;
        c.beginPath();
        c.arc(X(r.lapTime + off), Y(r.angle), 4, 0, Math.PI * 2);
        c.fill();
      }
    } else {
      c.beginPath();
      let previous = null;
      for (const r of laps[lap].rows) {
        const t = r[2] + off,
          value = r[ch.col];
        if (t < state.min - 0.2 || t > state.max + 0.2 || value === null) {
          previous = null;
          continue;
        }
        if (!previous) c.moveTo(X(t), Y(value));
        else if (ch.step) {
          c.lineTo(X(t), Y(previous[1]));
          c.lineTo(X(t), Y(value));
        } else c.lineTo(X(t), Y(value));
        previous = [t, value];
      }
      c.stroke();
    }
    const end = laps[lap].duration + off;
    c.setLineDash([3, 4]);
    c.lineWidth = 0.8;
    c.beginPath();
    c.moveTo(X(end), g.top);
    c.lineTo(X(end), g.bottom);
    c.stroke();
    c.setLineDash([]);
  }
  if (state.cursor >= state.min && state.cursor <= state.max) {
    c.strokeStyle = "#536b89";
    c.lineWidth = 1;
    c.setLineDash([3, 3]);
    c.beginPath();
    c.moveTo(X(state.cursor), g.top);
    c.lineTo(X(state.cursor), g.bottom);
    c.stroke();
    c.setLineDash([]);
  }
  if (state.drag && state.drag.mode === "zoom") {
    const a = X(state.drag.start),
      b = X(state.drag.end);
    c.fillStyle = "#1865dc22";
    c.fillRect(Math.min(a, b), g.top, Math.abs(a - b), g.bottom - g.top);
  }
  c.restore();
  if (ch.steering && !measured.some((a) => a.some((v) => v.angle !== null))) {
    c.fillStyle = "#7a899e";
    c.textAlign = "center";
    c.fillText(
      "Nessuna misura di sterzo: usa la linea sul video qui sopra.",
      (g.left + g.right) / 2,
      (g.top + g.bottom) / 2,
    );
  }
  for (let i = 0; i < 2; i++) {
    const v = nearestValue(i, ch, state.cursor);
    ch.values[i].textContent =
      v === null
        ? "—"
        : Number.isInteger(v)
          ? v
          : v.toFixed(ch.steering ? 1 : ch.col >= 6 ? 1 : 0);
  }
}
function pointerTime(cv, e) {
  const r = cv.getBoundingClientRect(),
    g = cv._g;
  return (
    state.min +
    ((e.clientX - r.left - g.left) / (g.right - g.left)) *
      (state.max - state.min)
  );
}
function bindPlot(ch) {
  const cv = ch.canvas;
  cv.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const a = state.min,
        b = state.max,
        t = pointerTime(cv, e),
        factor = Math.exp(Math.max(-1, Math.min(1, e.deltaY * 0.002)));
      setRange(t - (t - a) * factor, t + (b - t) * factor);
    },
    { passive: false },
  );
  cv.addEventListener("dblclick", fullView);
  cv.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    cv.setPointerCapture(e.pointerId);
    const t = pointerTime(cv, e);
    state.cursor = Math.max(state.min, Math.min(state.max, t));
    state.drag = {
      mode: e.shiftKey ? "pan" : "zoom",
      start: t,
      end: t,
      x: e.clientX,
      min: state.min,
      max: state.max,
    };
    schedule();
  });
  cv.addEventListener("pointermove", (e) => {
    const t = pointerTime(cv, e);
    if (state.drag) {
      if (state.drag.mode === "pan") {
        const dx =
          ((e.clientX - state.drag.x) / (cv._g.right - cv._g.left)) *
          (state.drag.max - state.drag.min);
        setRange(state.drag.min - dx, state.drag.max - dx);
      } else state.drag.end = t;
    } else state.cursor = Math.max(state.min, Math.min(state.max, t));
    schedule();
  });
  cv.addEventListener("pointerup", (e) => {
    const d = state.drag;
    state.drag = null;
    if (d && d.mode === "zoom" && Math.abs(e.clientX - d.x) > 7)
      setRange(Math.min(d.start, d.end), Math.max(d.start, d.end));
    schedule();
  });
  cv.addEventListener("pointercancel", () => {
    state.drag = null;
    schedule();
  });
  cv.addEventListener("keydown", (e) => {
    if (e.key === "Escape") fullView();
    else if (e.key === "+" || e.key === "=") zoom(0.5);
    else if (e.key === "-") zoom(2);
    else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const dx =
        (state.max - state.min) * 0.2 * (e.key === "ArrowRight" ? 1 : -1);
      setRange(state.min + dx, state.max + dx);
    }
  });
}
function zoom(f) {
  const m = (state.min + state.max) / 2,
    w = (state.max - state.min) * f;
  setRange(m - w / 2, m + w / 2);
}
$("zoomIn").onclick = () => zoom(0.5);
$("zoomOut").onclick = () => zoom(2);
$("resetView").onclick = fullView;
$("applyRange").onclick = () =>
  setRange(Number($("rangeStart").value), Number($("rangeEnd").value));
$("offset").onchange = (e) => setOffset(Number(e.target.value));
$("offsetSlider").oninput = (e) => setOffset(Number(e.target.value));
$("resetOffset").onclick = () => setOffset(0);
function message(text) {
  $("message").textContent = text;
}
function download(blob, name) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
function csvCell(v) {
  return v === null || v === undefined
    ? ""
    : String(v).includes(",") || String(v).includes('"')
      ? '"' + String(v).replaceAll('"', '""') + '"'
      : String(v);
}
function csvDownload(rows, name) {
  download(
    new Blob([rows.map((r) => r.map(csvCell).join(",")).join("\r\n")], {
      type: "text/csv;charset=utf-8",
    }),
    name,
  );
}
$("exportData").onclick = () => {
  const rows = [
    [
      "video_id",
      "frame_index",
      "video_time_s",
      "lap_elapsed_s_est",
      "aligned_time_s",
      "speed_kmh",
      "engine_rpm",
      "gear",
      "throttle_pct_est",
      "brake_pct_est",
    ],
  ];
  laps.forEach((lap, i) =>
    lap.rows.forEach((r) =>
      rows.push([
        "giro" + (i + 1),
        r[0],
        r[1],
        r[2],
        +(r[2] + (i ? state.offset : 0)).toFixed(6),
        ...r.slice(3),
      ]),
    ),
  );
  csvDownload(rows, "monza-confronto.csv");
};
$("exportView").onclick = () => {
  drawAll();
  const width = Math.max(
      1000,
      Math.round(channels[0].canvas.getBoundingClientRect().width),
    ),
    top = 100,
    bottom = 70,
    heights = channels.map(
      (ch) => Math.round(ch.canvas.getBoundingClientRect().height) + 32,
    ),
    cv = document.createElement("canvas");
  cv.width = width;
  cv.height = top + bottom + heights.reduce((a, b) => a + b, 0);
  const c = cv.getContext("2d");
  c.fillStyle = "#f3f6fa";
  c.fillRect(0, 0, cv.width, cv.height);
  c.fillStyle = "#1b2d49";
  c.font = "bold 25px system-ui";
  c.fillText("Monza · confronto interattivo", 24, 36);
  c.font = "13px system-ui";
  c.fillStyle = COLORS[0];
  c.fillText("Blu: giro 4 · 1:33.07", 24, 65);
  c.fillStyle = COLORS[1];
  c.fillText("Arancione: giro 6 · 1:32.49", 240, 65);
  c.fillStyle = "#65768d";
  c.fillText(
    `Spostamento arancione: ${state.offset.toFixed(3)} s · asse X: tempo reale`,
    24,
    86,
  );
  let y = top;
  channels.forEach((ch, i) => {
    c.fillStyle = "#1b2d49";
    c.font = "bold 13px system-ui";
    c.fillText(ch.name + " " + ch.unit, 24, y + 21);
    const h = heights[i] - 32;
    c.drawImage(ch.canvas, 0, y + 32, width, h);
    y += heights[i];
  });
  c.fillStyle = "#65768d";
  c.font = "12px system-ui";
  c.fillText(
    "Pedali stimati; sterzo: misure manuali dell’angolo apparente. Letture incerte escluse.",
    24,
    y + 28,
  );
  c.fillText(
    "Allo stesso secondo le auto possono trovarsi in punti diversi della pista.",
    24,
    y + 49,
  );
  cv.toBlob((b) => download(b, "monza-confronto.png"), "image/png");
};
function loadVideo(input, video, key, callback, before) {
  input.onchange = () => {
    const file = input.files[0];
    if (!file) return;
    if (before && !before()) {
      input.value = "";
      return;
    }
    if (sourceURLs[key]) URL.revokeObjectURL(sourceURLs[key]);
    sourceURLs[key] = URL.createObjectURL(file);
    video.src = sourceURLs[key];
    video.load();
    callback?.();
  };
  video.addEventListener("error", () =>
    message(
      "Il browser non riesce a leggere questo video. Prova Safari su Mac o una copia MP4 H.264.",
    ),
  );
}
for (const [key, i] of [
  ["A", 0],
  ["B", 1],
]) {
  const video = $("video" + key);
  loadVideo($("file" + key), video, key);
  video.addEventListener("timeupdate", () => {
    $("time" + key).textContent =
      `Video ${video.currentTime.toFixed(3)} s · nel giro ${(video.currentTime - laps[i].sourceStart).toFixed(3)} s`;
    $("anchor" + key).value = (video.currentTime - laps[i].sourceStart).toFixed(
      3,
    );
  });
}
function stepVideo(video, lap, direction, origin = 0) {
  if (!video.videoWidth) {
    message("Apri prima un video leggibile.");
    return;
  }
  video.pause();
  const sourceTime = video.currentTime + origin,
    rows = laps[lap].rows;
  let r;
  if (direction > 0) r = rows.find((r) => r[1] > sourceTime + 0.004);
  else r = rows.findLast((r) => r[1] < sourceTime - 0.004);
  let time = (r ? r[1] : sourceTime + direction / 30) - origin;
  video.currentTime = Math.max(0, Math.min(video.duration || Infinity, time));
}
document
  .querySelectorAll("[data-step-video]")
  .forEach(
    (b) =>
      (b.onclick = () =>
        stepVideo(
          $("video" + b.dataset.stepVideo),
          b.dataset.stepVideo === "A" ? 0 : 1,
          Number(b.dataset.direction),
        )),
  );
$("alignVideos").onclick = () => {
  const a = $("videoA"),
    b = $("videoB");
  if (!a.videoWidth || !b.videoWidth) {
    message("Apri entrambi i video prima di allineare i fotogrammi.");
    $("message").scrollIntoView({ block: "nearest" });
    return;
  }
  const ta = a.currentTime - laps[0].sourceStart,
    tb = b.currentTime - laps[1].sourceStart;
  $("anchorA").value = ta.toFixed(3);
  $("anchorB").value = tb.toFixed(3);
  setOffset(ta - tb);
};
$("alignAnchors").onclick = () =>
  setOffset(Number($("anchorA").value) - Number($("anchorB").value));
$("syncVideos").onclick = () => {
  [$("videoA"), $("videoB")].forEach((v, i) => {
    if (v.videoWidth) {
      v.pause();
      v.currentTime = Math.max(
        0,
        Math.min(
          v.duration,
          state.cursor - (i ? state.offset : 0) + laps[i].sourceStart,
        ),
      );
    }
  });
};
// Steering measurements: each point is explicit, with its original timestamp and baseline.
const sv = $("steerVideo"),
  overlay = $("steerOverlay");
function selectedLap() {
  return Number($("steerLap").value);
}
function sourceSteerTime() {
  return sv.currentTime + steerOrigin;
}
function angleOf(points) {
  return (
    (Math.atan2(
      (points[1].y - points[0].y) * sv.videoHeight,
      (points[1].x - points[0].x) * sv.videoWidth,
    ) *
      180) /
    Math.PI
  );
}
function wrap(a) {
  return ((((a + 180) % 360) + 360) % 360) - 180;
}
function bodyAxis(angle) {
  return ((((angle + 90) % 180) + 180) % 180) - 90;
}
function bodySnapshot(points, method = "manual_body_line") {
  return {
    angle: bodyAxis(angleOf(points)),
    points: points.map((p) => ({ ...p })),
    videoTime: sourceSteerTime(),
    width: sv.videoWidth,
    height: sv.videoHeight,
    method,
  };
}
function recordMeasure(angle, status, line = null) {
  const lap = selectedLap(),
    t = sourceSteerTime(),
    r = nearest(laps[lap].rows, t, 1);
  if (
    t < laps[lap].sourceStart ||
    t > laps[lap].sourceStart + laps[lap].duration
  ) {
    message("Questo fotogramma è fuori dal giro selezionato.");
    return false;
  }
  const item = {
    id: ++measureId,
    lap,
    videoTime: +t.toFixed(6),
    lapTime: +(t - laps[lap].sourceStart).toFixed(6),
    frameIndex: Math.abs(r[1] - t) < 0.02 ? r[0] : null,
    angle: angle === null ? null : +angle.toFixed(3),
    status,
    points: line,
    baseline: calibrations[lap],
    bodyReference: bodyReferences[lap],
    bodyReferenceStatus: !bodyReferences[lap]
      ? "missing"
      : Math.abs(bodyReferences[lap].videoTime - t) < 0.025
        ? "same_frame"
        : "saved_reference_reused",
    frameIndexEstimated: Math.abs(r[1] - t) >= 0.02,
  };
  measured[lap].push(item);
  measured[lap].sort((a, b) => a.lapTime - b.lapTime);
  $("pointCount").textContent = measured.flat().length + " misure registrate.";
  schedule();
  return true;
}
function startDraw(mode) {
  if (demo && selectedLap() !== 0) {
    message(
      "L’esempio è del giro 4: per misurare il giro 6 apri il secondo originale.",
    );
    return;
  }
  if (!sv.videoWidth) {
    message("Attendi che il video sia pronto.");
    return;
  }
  if (mode !== "body" && !bodyReferences[selectedLap()]) {
    message("Traccia prima il riferimento fisso sui due lati della scocca.");
    return;
  }
  if (mode === "measure" && !calibrations[selectedLap()]) {
    message("Imposta prima lo zero sul rettilineo.");
    return;
  }
  sv.pause();
  drawing = mode;
  pending = [];
  activeLine = null;
  overlay.parentElement.classList.add("drawing");
  $("steerStatus").textContent =
    mode === "body"
      ? "Scocca: collega i due lati fissi come nella foto. Non stai ancora misurando lo sterzo."
      : (mode === "zero" ? "Volante dritto: " : "Misura volante: ") +
        "indica i due riferimenti mobili del volante nello stesso ordine. La misura usa la linea scocca come riferimento.";
  message("");
  drawOverlay();
}
$("setBody").onclick = () => startDraw("body");
$("setZero").onclick = () => startDraw("zero");
$("measureAngle").onclick = () => startDraw("measure");
overlay.addEventListener("pointerdown", (e) => {
  if (!drawing) return;
  e.preventDefault();
  const b = overlay.getBoundingClientRect();
  pending.push({
    x: Math.max(0, Math.min(1, (e.clientX - b.left) / b.width)),
    y: Math.max(0, Math.min(1, (e.clientY - b.top) / b.height)),
  });
  if (pending.length === 2) {
    const dx = (pending[1].x - pending[0].x) * sv.videoWidth,
      dy = (pending[1].y - pending[0].y) * sv.videoHeight;
    if (Math.hypot(dx, dy) < 15) {
      pending = [];
      message("Scegli due punti più distanti per ridurre l’errore di misura.");
      drawOverlay();
      return;
    }
    const lap = selectedLap();
    const wasBody = drawing === "body";
    if (wasBody) {
      bodyReferences[lap] = bodySnapshot(pending);
      $("steerStatus").textContent =
        "Riferimento scocca aggiornato. La scocca non genera misure di sterzo. Ora imposta lo zero del volante sul dritto, oppure misura il volante in questo fotogramma.";
    } else if (drawing === "zero") {
      if (measured[lap].some((p) => p.angle !== null)) {
        pending = [];
        drawing = null;
        overlay.parentElement.classList.remove("drawing");
        message(
          "Per cambiare lo zero cancella prima le misure di questo giro, così non mescoli calibrazioni diverse.",
        );
        return;
      }
      calibrations[lap] = {
        angle: wrap(angleOf(pending) - bodyReferences[lap].angle),
        wheelImageAngle: angleOf(pending),
        bodyReference: bodyReferences[lap],
        points: pending.map((p) => ({ ...p })),
        videoTime: sourceSteerTime(),
        width: sv.videoWidth,
        height: sv.videoHeight,
      };
      recordMeasure(
        0,
        "manual_zero",
        pending.map((p) => ({ ...p })),
      );
      $("steerStatus").textContent =
        "Zero impostato. Avanza nel video e misura gli stessi due riferimenti nello stesso ordine.";
    } else {
      const angle = wrap(
        angleOf(pending) - bodyReferences[lap].angle - calibrations[lap].angle,
      );
      recordMeasure(
        angle,
        "manual_line",
        pending.map((p) => ({ ...p })),
      );
      $("steerStatus").textContent =
        `Angolo apparente ${angle >= 0 ? "+" : ""}${angle.toFixed(1)}° · video ${sourceSteerTime().toFixed(3)} s. Misura confermata manualmente.`;
    }
    activeLine = {
      points: pending.map((p) => ({ ...p })),
      time: sv.currentTime,
      type: wasBody ? "body" : "wheel",
    };
    drawing = null;
    pending = [];
    overlay.parentElement.classList.remove("drawing");
  }
  drawOverlay();
});
function drawOverlay() {
  const w = sv.videoWidth || 900,
    h = sv.videoHeight || 426;
  overlay.width = w;
  overlay.height = h;
  const c = overlay.getContext("2d");
  function line(pts, color, dashed = false) {
    if (!pts?.length) return;
    c.strokeStyle = color;
    c.fillStyle = color;
    c.lineWidth = Math.max(2, w / 300);
    c.setLineDash(dashed ? [10, 8] : []);
    c.beginPath();
    c.moveTo(pts[0].x * w, pts[0].y * h);
    if (pts.length > 1) c.lineTo(pts[1].x * w, pts[1].y * h);
    c.stroke();
    c.setLineDash([]);
    pts.forEach((p, i) => {
      c.beginPath();
      c.arc(p.x * w, p.y * h, 6, 0, Math.PI * 2);
      c.fill();
      c.font = "bold 16px system-ui";
      c.fillText(String(i + 1), p.x * w + 9, p.y * h - 7);
    });
  }
  const body = bodyReferences[selectedLap()];
  line(body?.points, "#ffc65c", true);
  $("bodyStatus").textContent = !body
    ? "Nessuna linea scocca. Collega i due lati fissi come nella foto."
    : `${body.method === "photo_example_approx" ? "Linea scocca proposta dalla foto: verificala. " : "Scocca impostata. "}${Math.abs(body.videoTime - sourceSteerTime()) < 0.025 ? "Riferimento di questo fotogramma." : "Riferimento salvato riutilizzato: se la camera ruota, aggiornalo sul fotogramma corrente prima di misurare il volante."}`;
  line(calibrations[selectedLap()]?.points, "#94a3b8", true);
  if (activeLine && Math.abs(activeLine.time - sv.currentTime) < 0.025)
    line(activeLine.points, activeLine.type === "body" ? "#ffc65c" : "#39e6b0");
  line(pending, "#ffdd55");
}
sv.addEventListener("loadedmetadata", () => {
  if (demo && !bodyReferences[0]) {
    bodyReferences[0] = bodySnapshot(
      [
        { x: 0.16, y: 0.692 },
        { x: 0.907, y: 0.728 },
      ],
      "photo_example_approx",
    );
  }
  drawOverlay();
});
sv.addEventListener("timeupdate", () => {
  $("steerClock").textContent =
    "Video originale " + sourceSteerTime().toFixed(3) + " s";
  if (drawing) {
    drawing = null;
    pending = [];
    overlay.parentElement.classList.remove("drawing");
    $("steerStatus").textContent =
      "Fotogramma cambiato: premi di nuovo il comando di misura.";
  }
  drawOverlay();
});
sv.addEventListener("seeked", drawOverlay);
sv.addEventListener("error", () =>
  message("Video sterzo non leggibile in questo browser. Prova un MP4 H.264."),
);
$("steerPrevious").onclick = () =>
  stepVideo(sv, selectedLap(), -1, steerOrigin);
$("steerNext").onclick = () => stepVideo(sv, selectedLap(), 1, steerOrigin);
$("steerRate").onchange = (e) => {
  sv.playbackRate = Number(e.target.value);
};
$("steerLap").onchange = () => {
  if (demo && selectedLap() !== 0) {
    message(
      "Hai selezionato il giro 6. Apri il secondo video originale: l’esempio qui è del giro 4.",
    );
  }
  drawing = null;
  pending = [];
  activeLine = null;
  overlay.parentElement.classList.remove("drawing");
  drawOverlay();
};
loadVideo(
  $("steerFile"),
  sv,
  "steer",
  () => {
    demo = false;
    steerOrigin = 0;
    drawing = null;
    pending = [];
    activeLine = null;
    calibrations[selectedLap()] = null;
    bodyReferences[selectedLap()] = null;
    measured[selectedLap()] = [];
    $("pointCount").textContent =
      measured.flat().length + " misure registrate.";
    $("steerStatus").textContent =
      "Video aperto. Seleziona il giro corretto e imposta lo zero.";
    overlay.parentElement.classList.remove("drawing");
    schedule();
  },
  () =>
    !measured[selectedLap()].length ||
    confirm(
      "Il nuovo video richiede una nuova calibrazione. Cancellare le misure di sterzo del giro selezionato? Esporta prima il CSV per conservarle.",
    ),
);
$("markMissing").onclick = () => {
  sv.pause();
  if (!sv.videoWidth) return;
  if (demo && selectedLap() !== 0) {
    message("Apri prima il secondo video originale.");
    return;
  }
  recordMeasure(null, "occluded");
  $("steerStatus").textContent =
    "Fotogramma segnato come non leggibile: non è stato assegnato un angolo.";
};
$("undoSteering").onclick = () => {
  const lap = selectedLap();
  if (measured[lap].length) {
    const lastId = Math.max(...measured[lap].map((p) => p.id));
    measured[lap].splice(
      measured[lap].findIndex((p) => p.id === lastId),
      1,
    );
  }
  if (!measured[lap].some((p) => p.status === "manual_zero"))
    calibrations[lap] = null;
  $("pointCount").textContent = measured.flat().length + " misure registrate.";
  activeLine = null;
  schedule();
  drawOverlay();
};
$("clearSteering").onclick = () => {
  const lap = selectedLap();
  if (
    measured[lap].length &&
    !confirm("Cancellare le misure di sterzo del giro selezionato?")
  )
    return;
  measured[lap] = [];
  calibrations[lap] = null;
  bodyReferences[lap] = null;
  drawing = null;
  pending = [];
  activeLine = null;
  overlay.parentElement.classList.remove("drawing");
  $("pointCount").textContent = measured.flat().length + " misure registrate.";
  $("steerStatus").textContent =
    "Misure cancellate per il giro selezionato. Imposta un nuovo zero.";
  schedule();
  drawOverlay();
};
$("exportSteering").onclick = () => {
  const rows = [
    [
      "video_id",
      "video_time_s",
      "lap_elapsed_s_est",
      "aligned_time_s",
      "original_frame_index_est",
      "angle_apparent_deg",
      "status",
      "line_points_normalized_json",
      "zero_reference_json",
      "body_reference_json",
      "body_reference_status",
    ],
  ];
  for (const p of measured
    .flat()
    .sort((a, b) => a.lap - b.lap || a.videoTime - b.videoTime))
    rows.push([
      "giro" + (p.lap + 1),
      p.videoTime,
      p.lapTime,
      +(p.lapTime + (p.lap ? state.offset : 0)).toFixed(6),
      p.frameIndex,
      p.angle,
      p.status,
      JSON.stringify(p.points),
      JSON.stringify(p.baseline),
      JSON.stringify(p.bodyReference),
      p.bodyReferenceStatus,
    ]);
  csvDownload(rows, "monza-sterzo-manuale.csv");
};
window.addEventListener("resize", () => {
  schedule();
  drawOverlay();
});
// Expose state for useful browser interaction checks and future integration.
window.monzaViewer = {
  state,
  laps,
  measured,
  calibrations,
  bodyReferences,
  setRange,
  setOffset,
  fullView,
  nearestValue,
  channels,
  drawAll,
  sourceSteerTime,
};
fullView();
