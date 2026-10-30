"use strict";

const $ = (id) => document.getElementById(id);
const laps = [];
const LAP_COLORS = [];
const channels = [
  {
    id: "speed",
    name: "Velocità",
    short: "Vel.",
    unit: "km/h",
    col: 3,
    min: 0,
    max: 450,
    ticks: [0, 50, 100, 150, 200, 250, 300, 350, 400, 450],
    color: "#61758d",
    center: 0.34,
    span: 0.58,
  },
  {
    id: "rpm",
    name: "Giri motore",
    short: "RPM",
    unit: "giri/min",
    col: 4,
    min: 0,
    max: 22000,
    ticks: [0, 5000, 10000, 15000, 20000],
    color: "#61758d",
    center: 0.48,
    span: 0.42,
  },
  {
    id: "gear",
    name: "Marcia",
    short: "Marcia",
    unit: "",
    col: 5,
    min: 0,
    max: 9,
    ticks: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    color: "#61758d",
    center: 0.65,
    span: 0.3,
    step: true,
  },
  {
    id: "throttle",
    name: "Acceleratore",
    short: "Accel.",
    unit: "%",
    col: 6,
    min: 0,
    max: 100,
    ticks: [0, 25, 50, 75, 100],
    color: "#61758d",
    center: 0.82,
    span: 0.26,
    estimated: true,
  },
  {
    id: "brake",
    name: "Freno",
    short: "Freno",
    unit: "%",
    col: 7,
    min: 0,
    max: 100,
    ticks: [0, 25, 50, 75, 100],
    color: "#61758d",
    center: 0.82,
    span: 0.26,
    estimated: true,
  },
];
channels.forEach((ch) => {
  ch.defaults = { center: ch.center, span: ch.span };
  ch.visible = true;
});
const state = {
  min: 0,
  max: 10,
  dataset: 0,
  offset: 0,
  referenceOffset: 0,
  cursorLocked: false,
  cursor: 0,
  active: "speed",
  mode: "zoom",
  lapVisible: [],
  drag: null,
};
const cv = $("plot"),
  sourceURLs = {};
const pendingSeeks = [null, null],
  videoBindings = [null, null];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
let scheduled = false,
  saveTimer;
function message(text) {
  $("message").textContent = text;
}
function remember() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(
        "driver-notes-chart-layout-v2",
        JSON.stringify({
          active: state.active,
          channels: channels.map(({ id, center, span, visible }) => ({
            id,
            center,
            span,
            visible,
          })),
        }),
      );
    } catch {}
  }, 150);
}
try {
  const saved = JSON.parse(
    localStorage.getItem("driver-notes-chart-layout-v2"),
  );
  for (const item of saved?.channels || []) {
    const ch = channels.find((c) => c.id === item.id);
    if (ch && Number.isFinite(item.center) && Number.isFinite(item.span)) {
      ch.center = clamp(item.center, -1, 2);
      ch.span = clamp(item.span, 0.05, 2.8);
      ch.visible = item.visible !== false;
    }
  }
  if (channels.some((c) => c.id === saved?.active)) state.active = saved.active;
} catch {}
function activeChannel() {
  return channels.find((c) => c.id === state.active);
}
function selectChannel(ch) {
  state.active = ch.id;
  updateControls();
  schedule();
  remember();
}
function setChannel(ch, changes) {
  if (Number.isFinite(changes.center)) ch.center = clamp(changes.center, -1, 2);
  if (Number.isFinite(changes.span)) ch.span = clamp(changes.span, 0.05, 2.8);
  if (typeof changes.visible === "boolean") ch.visible = changes.visible;
  updateControls();
  schedule();
  remember();
}
for (const ch of channels) {
  const card = document.createElement("div");
  card.className = "channel-card";
  card.style.setProperty("--channel", ch.color);
  card.dataset.channel = ch.id;
  card.innerHTML = `<div class="channel-title"><input type="checkbox" checked aria-label="Mostra ${ch.name}"><button type="button">${ch.name}</button></div><div class="channel-values"><span><b>—</b> ${ch.unit}</span><small><b>—</b></small></div>`;
  ch.card = card;
  ch.checkbox = card.querySelector("input");
  ch.values = card.querySelectorAll("b");
  ch.checkbox.onchange = () => setChannel(ch, { visible: ch.checkbox.checked });
  card.querySelector("button").onclick = () => selectChannel(ch);
  card.addEventListener("click", (e) => {
    if (e.target.tagName !== "INPUT") selectChannel(ch);
  });
  $("channelList").append(card);
}
function updateControls() {
  const selected = activeChannel();
  for (const ch of channels) {
    ch.card.classList.toggle("active", ch === selected);
    ch.card.classList.toggle("hidden", !ch.visible);
    ch.checkbox.checked = ch.visible;
    ch.card
      .querySelector("button")
      .setAttribute("aria-pressed", String(ch === selected));
  }
  $("activeName").textContent = selected.name;
  $("activeName").style.color = selected.color;
  $("channelScale").value = Math.round(selected.span * 100);
  $("scaleValue").value = Math.round(selected.span * 100) + "%";
  $("channelPosition").value = Math.round(selected.center * 100);
  $("positionValue").value = Math.round(selected.center * 100) + "%";
  $("channelScale").setAttribute(
    "aria-label",
    "Ampiezza verticale: " + selected.name,
  );
  $("channelPosition").setAttribute(
    "aria-label",
    "Posizione verticale: " + selected.name,
  );
}
$("channelScale").oninput = (e) =>
  setChannel(activeChannel(), { span: Number(e.target.value) / 100 });
$("channelPosition").oninput = (e) =>
  setChannel(activeChannel(), { center: Number(e.target.value) / 100 });
$("channelSmaller").onclick = () =>
  setChannel(activeChannel(), { span: activeChannel().span / 1.2 });
$("channelLarger").onclick = () =>
  setChannel(activeChannel(), { span: activeChannel().span * 1.2 });
$("resetChannel").onclick = () =>
  setChannel(activeChannel(), activeChannel().defaults);
$("resetLayout").onclick = () => {
  channels.forEach((ch) => Object.assign(ch, ch.defaults, { visible: true }));
  updateControls();
  schedule();
  remember();
};
function lapShift(i) {
  return laps[i]?.shift || 0;
}
function bounds() {
  const active = laps.filter(Boolean);
  return [
    Math.min(0, ...active.map((l) => l.shift || 0)),
    Math.max(
      active.length ? 0.15 : 10,
      ...active.map((l) => l.duration + (l.shift || 0)),
    ),
  ];
}
function updateAlignmentStatus() {
  $("alignmentStatus").textContent = laps.filter(Boolean).length
    ? "Seleziona un dataset e clicca sul grafico per fissare il riferimento."
    : "Apri un set di dati dalla libreria.";
}
function setRange(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) {
    message("Inserisci un intervallo valido, con la fine dopo l’inizio.");
    return false;
  }
  const [lo, hi] = bounds(),
    width = clamp(b - a, 0.15, hi - lo);
  state.min = clamp(a, lo, hi - width);
  state.max = state.min + width;
  if (!state.cursorLocked)
    state.cursor = clamp(state.cursor, state.min, state.max);
  message("");
  schedule();
  return true;
}
function fullView() {
  setRange(...bounds());
}
function setOffset(value, { preserveRange = false } = {}) {
  if (!Number.isFinite(value) || Math.abs(value) > 1e7) {
    message("Spostamento non valido.");
    return false;
  }
  const old = bounds(),
    wasFull =
      Math.abs(state.min - old[0]) < 0.02 &&
      Math.abs(state.max - old[1]) < 0.02;
  if (!laps[state.dataset]) return false;
  laps[state.dataset].shift = value;
  updateAlignmentStatus();
  if (!preserveRange) {
    if (wasFull) fullView();
    else setRange(state.min, state.max);
  }
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
  if (!a) return rows[0];
  if (a === rows.length) return rows.at(-1);
  return Math.abs(rows[a][index] - time) < Math.abs(rows[a - 1][index] - time)
    ? rows[a]
    : rows[a - 1];
}
function nearestValue(lap, ch, x) {
  if (!laps[lap]) return null;
  const t = x - lapShift(lap);
  if (t < 0 || t > laps[lap].duration) return null;
  const row = nearest(laps[lap].rows, t);
  return row && Math.abs(row[2] - t) < 0.12 ? row[ch.col] : null;
}
function schedule() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    drawAll();
  });
}
function geometry(w, h) {
  const visible = channels.filter((c) => c.visible),
    compact = w < 700;
  const rulers = compact
    ? visible.includes(activeChannel())
      ? [activeChannel()]
      : visible.slice(0, 1)
    : visible;
  return {
    left: 12 + rulers.length * (compact ? 40 : 34),
    right: w - 16,
    top: 58,
    bottom: h - 34,
    rulers,
    rulerWidth: compact ? 40 : 34,
  };
}
function channelY(ch, value, g) {
  return (
    g.top +
    (ch.center - ((value - ch.min) / (ch.max - ch.min) - 0.5) * ch.span) *
      (g.bottom - g.top)
  );
}
function drawScene(c, w, h, exporting = false) {
  const g = geometry(w, h),
    height = g.bottom - g.top,
    selected = activeChannel();
  const X = (t) =>
    g.left + ((t - state.min) / (state.max - state.min)) * (g.right - g.left);
  c.fillStyle = "#fff";
  c.fillRect(0, 0, w, h);
  c.font = "10px system-ui";
  c.textBaseline = "middle";
  const rulers = [];
  g.rulers.forEach((ch, i) => {
    const x = 12 + i * g.rulerWidth,
      axis = x + g.rulerWidth - 6;
    if (ch === selected) {
      c.fillStyle = ch.color + "0c";
      c.fillRect(x, 0, g.rulerWidth - 2, h - 28);
    }
    c.fillStyle = ch.color;
    c.textAlign = "center";
    c.font = "600 10px system-ui";
    c.fillText(ch.short, x + g.rulerWidth / 2, 17);
    c.font = "9px system-ui";
    c.fillStyle = "#7a899b";
    c.fillText(ch.id === "rpm" ? "rpm" : ch.unit, x + g.rulerWidth / 2, 33);
    c.strokeStyle = ch.color + "55";
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(axis, g.top);
    c.lineTo(axis, g.bottom);
    c.stroke();
    let last = -Infinity;
    for (const tick of [...ch.ticks].reverse()) {
      const y = channelY(ch, tick, g);
      if (y < g.top || y > g.bottom || y - last < 18) continue;
      last = y;
      c.textAlign = "right";
      c.fillStyle = ch.color;
      c.font = "9px system-ui";
      c.fillText(
        ch.id === "rpm" && tick >= 1000 ? String(tick / 1000) + "k" : tick,
        axis - 3,
        y,
      );
      c.strokeStyle = ch.color;
      c.beginPath();
      c.moveTo(axis - 3, y);
      c.lineTo(axis + 2, y);
      c.stroke();
    }
    const upper = channelY(ch, ch.max, g),
      lower = channelY(ch, ch.min, g);
    if (ch === selected)
      for (const y of [upper, lower])
        if (y >= g.top && y <= g.bottom) {
          c.fillStyle = ch.color;
          c.fillRect(axis - 6, y - 3, 12, 6);
        }
    rulers.push({ ch, x, width: g.rulerWidth, axis, upper, lower });
  });
  c.save();
  c.beginPath();
  c.rect(g.left, g.top, g.right - g.left, height);
  c.clip();
  c.lineWidth = 1;
  for (const tick of selected.ticks) {
    const y = channelY(selected, tick, g);
    if (y < g.top || y > g.bottom) continue;
    c.strokeStyle = "#eaf0f5";
    c.beginPath();
    c.moveTo(g.left, y);
    c.lineTo(g.right, y);
    c.stroke();
  }
  const rough = (state.max - state.min) / (w < 650 ? 5 : 10),
    power = 10 ** Math.floor(Math.log10(rough)),
    step = [1, 2, 5, 10].map((n) => n * power).find((n) => n >= rough);
  for (
    let t = Math.ceil(state.min / step) * step;
    t <= state.max + step * 0.001;
    t += step
  ) {
    c.strokeStyle = "#eaf0f5";
    c.beginPath();
    c.moveTo(X(t), g.top);
    c.lineTo(X(t), g.bottom);
    c.stroke();
  }
  const ordered = [
    ...channels.filter((ch) => ch !== selected),
    selected,
  ].filter((ch) => ch.visible);
  for (const ch of ordered)
    for (let lap = 0; lap < laps.length; lap++) {
      if (!laps[lap] || !state.lapVisible[lap]) continue;
      c.strokeStyle = LAP_COLORS[lap];
      c.lineWidth = ch === selected ? 2 : 1.45;
      c.globalAlpha = 1;
      c.setLineDash([]);
      c.beginPath();
      let previous = null;
      for (const r of laps[lap].rows) {
        const t = r[2] + lapShift(lap),
          value = r[ch.col];
        if (value === null || t < state.min - 0.2 || t > state.max + 0.2) {
          previous = null;
          continue;
        }
        if (
          !previous ||
          r[2] - previous.time >
            Math.max(0.15, 1.6 / (laps[lap].sampleRate || 10))
        )
          c.moveTo(X(t), channelY(ch, value, g));
        else if (ch.step) {
          c.lineTo(X(t), channelY(ch, previous.value, g));
          c.lineTo(X(t), channelY(ch, value, g));
        } else c.lineTo(X(t), channelY(ch, value, g));
        previous = { time: r[2], value };
      }
      c.stroke();
      c.globalAlpha = 1;
      c.setLineDash([]);
    }
  if (state.cursor >= state.min && state.cursor <= state.max) {
    c.strokeStyle = "#70849c";
    c.lineWidth = state.cursorLocked ? 1.5 : 1;
    c.setLineDash(state.cursorLocked ? [] : [3, 4]);
    c.beginPath();
    c.moveTo(X(state.cursor), g.top);
    c.lineTo(X(state.cursor), g.bottom);
    c.stroke();
    c.setLineDash([]);
    for (const ch of ordered)
      for (let lap = 0; lap < laps.length; lap++) {
        if (!laps[lap] || !state.lapVisible[lap]) continue;
        const value = nearestValue(lap, ch, state.cursor);
        if (value === null) continue;
        c.fillStyle = LAP_COLORS[lap];
        c.strokeStyle = LAP_COLORS[lap];
        c.lineWidth = 1.4;
        c.beginPath();
        c.arc(
          X(state.cursor),
          channelY(ch, value, g),
          lap ? 3.5 : 2.8,
          0,
          Math.PI * 2,
        );
        c.fill();
        c.stroke();
      }
  }
  if (!exporting && state.drag?.mode === "zoom") {
    c.fillStyle = "#246bdb16";
    const a = X(state.drag.start),
      b = X(state.drag.end);
    c.fillRect(Math.min(a, b), g.top, Math.abs(a - b), height);
  }
  c.restore();
  c.fillStyle = "#78899d";
  c.textAlign = "center";
  c.font = "10px system-ui";
  for (
    let t = Math.ceil(state.min / step) * step;
    t <= state.max + step * 0.001;
    t += step
  )
    c.fillText(t.toFixed(step < 1 ? 2 : step < 5 ? 1 : 0) + " s", X(t), h - 13);
  if (!laps.some(Boolean)) {
    c.fillStyle = "#72849a";
    c.textAlign = "center";
    c.fillText(
      "Apri un dataset salvato per iniziare.",
      (g.left + g.right) / 2,
      (g.top + g.bottom) / 2,
    );
  }
  if (!ordered.length) {
    c.fillStyle = "#72849a";
    c.fillText(
      "Attiva un canale dalla lista a sinistra.",
      (g.left + g.right) / 2,
      (g.top + g.bottom) / 2,
    );
  }
  return { ...g, rulerRects: rulers };
}
function drawAll() {
  const rect = cv.getBoundingClientRect(),
    dpr = window.devicePixelRatio || 1;
  cv.width = Math.round(rect.width * dpr);
  cv.height = Math.round(rect.height * dpr);
  const c = cv.getContext("2d");
  c.scale(dpr, dpr);
  cv._g = drawScene(c, rect.width, rect.height);
  $("cursorReadout").textContent =
    state.cursor.toFixed(3) + (state.cursorLocked ? " s · fisso" : " s");
  $("unlockCursor").disabled = !state.cursorLocked;
  for (const ch of channels) {
    const value = nearestValue(state.dataset, ch, state.cursor);
    ch.values[0].textContent =
      value === null ? "—" : value.toFixed(ch.col >= 6 ? 1 : 0);
    ch.values[1].textContent = laps[state.dataset]?.name || "Nessun dataset";
  }
}
function pointer(e) {
  const rect = cv.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}
function pointerTime(x) {
  const g = cv._g;
  return (
    state.min + ((x - g.left) / (g.right - g.left)) * (state.max - state.min)
  );
}
function rulerAt(x) {
  return cv._g.rulerRects.find((r) => x >= r.x && x < r.x + r.width);
}
cv.addEventListener(
  "wheel",
  (e) => {
    const p = pointer(e),
      ruler = rulerAt(p.x),
      g = cv._g;
    if (ruler) {
      e.preventDefault();
      selectChannel(ruler.ch);
      const factor = Math.exp(clamp(-e.deltaY * 0.002, -0.7, 0.7)),
        anchor = (p.y - g.top) / (g.bottom - g.top),
        span = clamp(ruler.ch.span * factor, 0.05, 2.8),
        actual = span / ruler.ch.span;
      setChannel(ruler.ch, {
        span,
        center: anchor + (ruler.ch.center - anchor) * actual,
      });
    }
  },
  { passive: false },
);
cv.addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;
  const p = pointer(e),
    g = cv._g,
    ruler = rulerAt(p.x);
  cv.setPointerCapture(e.pointerId);
  if (ruler) {
    selectChannel(ruler.ch);
    if (p.y < g.top) return;
    let mode = "channelMove";
    if (ruler.ch === activeChannel() && Math.abs(p.x - ruler.axis) < 13) {
      if (Math.abs(p.y - ruler.upper) < 9) mode = "resizeTop";
      else if (Math.abs(p.y - ruler.lower) < 9) mode = "resizeBottom";
    }
    state.drag = {
      mode,
      ch: ruler.ch,
      y: p.y,
      center: ruler.ch.center,
      span: ruler.ch.span,
    };
  } else if (p.x >= g.left && p.y >= g.top && p.y <= g.bottom) {
    const t = pointerTime(p.x);
    if (!state.cursorLocked) state.cursor = clamp(t, state.min, state.max);
    state.drag =
      state.mode === "dataset"
        ? {
            mode: "dataset",
            startX: p.x,
            offset: lapShift(state.dataset),
            secondsPerPixel: (state.max - state.min) / (g.right - g.left),
          }
        : state.mode === "move"
          ? {
              mode: "channelMove",
              ch: activeChannel(),
              y: p.y,
              center: activeChannel().center,
              span: activeChannel().span,
            }
          : {
              mode: e.shiftKey ? "pan" : "zoom",
              start: t,
              end: t,
              startX: p.x,
              min: state.min,
              max: state.max,
            };
  }
  schedule();
});
cv.addEventListener("pointermove", (e) => {
  const p = pointer(e),
    g = cv._g,
    d = state.drag;
  if (d) {
    const dy = (p.y - d.y) / (g.bottom - g.top);
    if (d.mode === "dataset")
      setOffset(d.offset + (p.x - d.startX) * d.secondsPerPixel, {
        preserveRange: true,
      });
    else if (d.mode === "channelMove")
      setChannel(d.ch, { center: d.center + dy });
    else if (d.mode === "resizeTop") {
      const bottom = d.center + d.span / 2,
        top = Math.min(bottom - 0.05, d.center - d.span / 2 + dy);
      setChannel(d.ch, { span: bottom - top, center: (top + bottom) / 2 });
    } else if (d.mode === "resizeBottom") {
      const top = d.center - d.span / 2,
        bottom = Math.max(top + 0.05, d.center + d.span / 2 + dy);
      setChannel(d.ch, { span: bottom - top, center: (top + bottom) / 2 });
    } else if (d.mode === "pan") {
      const dt = ((p.x - d.startX) / (g.right - g.left)) * (d.max - d.min);
      setRange(d.min - dt, d.max - dt);
    } else d.end = pointerTime(p.x);
    schedule();
    return;
  }
  const ruler = rulerAt(p.x);
  cv.style.cursor = ruler
    ? "grab"
    : state.mode === "dataset"
      ? "ew-resize"
      : state.mode === "move"
        ? "ns-resize"
        : "crosshair";
  if (!state.cursorLocked && !ruler && p.x >= g.left && p.x <= g.right) {
    state.cursor = clamp(pointerTime(p.x), state.min, state.max);
    schedule();
  }
});
function endPointer(e) {
  const d = state.drag;
  if (!d) return;
  state.drag = null;
  if (d.mode === "zoom") {
    if (Math.abs(pointer(e).x - d.startX) > 7)
      setRange(Math.min(d.start, d.end), Math.max(d.start, d.end));
    else pinCursor(clamp(pointerTime(pointer(e).x), state.min, state.max));
  }
  schedule();
}
cv.addEventListener("pointerup", endPointer);
cv.addEventListener("pointercancel", () => {
  state.drag = null;
  schedule();
});
cv.addEventListener("lostpointercapture", () => {
  if (state.drag) {
    state.drag = null;
    schedule();
  }
});
cv.addEventListener("dblclick", (e) => {
  const ruler = rulerAt(pointer(e).x);
  if (ruler) setChannel(ruler.ch, ruler.ch.defaults);
  else fullView();
});
cv.addEventListener("keydown", (e) => {
  const ch = activeChannel();
  if (e.key === "ArrowUp" || e.key === "ArrowDown") {
    e.preventDefault();
    setChannel(ch, {
      center:
        ch.center + (e.key === "ArrowUp" ? -1 : 1) * (e.shiftKey ? 0.05 : 0.01),
    });
  } else if (e.key === "+" || e.key === "=") {
    e.preventDefault();
    setChannel(ch, { span: ch.span * 1.15 });
  } else if (e.key === "-") {
    e.preventDefault();
    setChannel(ch, { span: ch.span / 1.15 });
  } else if (e.key === "Escape" && state.mode !== "dataset") {
    state.drag = null;
    schedule();
  }
});
function setMode(mode) {
  state.drag = null;
  state.mode = mode;
  for (const [id, name] of [
    ["modeZoom", "zoom"],
    ["modeMove", "move"],
    ["modeDataset", "dataset"],
  ])
    $(id).setAttribute("aria-pressed", String(mode === name));
  $("interactionHint").textContent =
    mode === "dataset"
      ? "Trascina il dataset selezionato · Alt+S o Esc per terminare"
      : mode === "move"
        ? "Trascina verticalmente il canale selezionato · Le scale a sinistra regolano la sua ampiezza"
        : "Clic: fissa il cursore · Trascina: ingrandisci · Maiusc + trascina: scorri · Doppio clic: giro intero";
  cv.style.cursor =
    mode === "dataset"
      ? "ew-resize"
      : mode === "move"
        ? "ns-resize"
        : "crosshair";
  schedule();
}
for (const [id, mode] of [
  ["modeZoom", "zoom"],
  ["modeMove", "move"],
  ["modeDataset", "dataset"],
])
  $(id).onclick = () => setMode(mode);
document.addEventListener("keydown", (e) => {
  const editing = e.target.closest?.(
    "textarea,select,[contenteditable=true],input:not([type=range]):not([type=checkbox]):not([type=file])",
  );
  if (!editing && e.altKey && !e.ctrlKey && !e.metaKey && e.code === "KeyS") {
    e.preventDefault();
    if (!e.repeat) setMode(state.mode === "dataset" ? "zoom" : "dataset");
  } else if (e.key === "Escape" && state.mode === "dataset") {
    e.preventDefault();
    if (state.drag?.mode === "dataset")
      setOffset(state.drag.offset, { preserveRange: true });
    setMode("zoom");
  }
});
$("resetView").onclick = fullView;
let resolveVideo = null,
  pair = [0, 1],
  alignmentGeneration = 0;
const shownVideoURLs = [null, null],
  seeking = [null, null];
function pinCursor(time) {
  state.cursor = time;
  state.cursorLocked = true;
  schedule();
  if ($("videoDetails").open) syncVideos();
}
$("unlockCursor").onclick = () => {
  state.cursorLocked = false;
  schedule();
};
function videoFor(side) {
  return $(side ? "videoB" : "videoA");
}
function seekSide(side) {
  const lap = laps[pair[side]],
    video = videoFor(side);
  if (!lap || !video.videoWidth) return;
  const target = state.cursor - lapShift(pair[side]) + lap.sourceStart;
  const limited = clamp(target, 0, video.duration);
  video.pause();
  seeking[side] = limited;
  if (Math.abs(video.currentTime - limited) < 0.001) {
    seeking[side] = null;
    return;
  }
  video.currentTime = limited;
  if (Math.abs(target - limited) > 0.03)
    $("videoStatus").textContent =
      "Il cursore è fuori dalla durata di uno dei video. Scegli un punto comune sul grafico.";
}
function syncVideos() {
  [0, 1].forEach(seekSide);
}
async function showPair() {
  const generation = ++alignmentGeneration;
  $("videoStatus").textContent = "Apertura degli onboard dal sito…";
  for (let side = 0; side < 2; side++) {
    const lap = laps[pair[side]],
      video = videoFor(side);
    video.pause();
    video.removeAttribute("src");
    video.load();
    if (shownVideoURLs[side]) URL.revokeObjectURL(shownVideoURLs[side]);
    shownVideoURLs[side] = null;
    seeking[side] = null;
    $(side ? "videoNameB" : "videoNameA").textContent =
      lap?.name || "Scegli un secondo dataset";
    if (!lap) continue;
    try {
      const file = await resolveVideo?.(lap.video);
      if (generation !== alignmentGeneration) return;
      if (!file) throw Error(`Onboard non disponibile per «${lap.name}».`);
      shownVideoURLs[side] = URL.createObjectURL(file);
      video.src = shownVideoURLs[side];
      video.load();
      $("videoStatus").textContent =
        "Sposta i fotogrammi: i dati seguono il video sotto il cursore fisso.";
    } catch (error) {
      $("videoStatus").textContent = error.message;
    }
  }
}
function refreshPair() {
  for (let side = 0; side < 2; side++) {
    const select = $(side ? "pairB" : "pairA");
    select.replaceChildren();
    laps.forEach((lap, i) => {
      if (lap) select.add(new Option(`Dataset ${i + 1} · ${lap.name}`, i));
    });
    if (!laps[pair[side]])
      pair[side] = laps.findIndex((l, i) => l && i !== pair[1 - side]);
    select.value = String(pair[side]);
  }
}
[0, 1].forEach((side) => {
  const video = videoFor(side);
  video.addEventListener("loadedmetadata", () => seekSide(side));
  video.addEventListener("error", () => {
    if (video.getAttribute("src"))
      $("videoStatus").textContent =
        "Video non leggibile. Prova Safari o una copia MP4 H.264.";
  });
  video.addEventListener("seeked", () => {
    const lap = laps[pair[side]];
    if (!lap) return;
    if (seeking[side] !== null) {
      const target = seeking[side];
      seeking[side] = null;
      if (Math.abs(video.currentTime - target) < 0.03) return;
    }
    if (!state.cursorLocked || !$("videoDetails").open) return;
    lap.shift = state.cursor - (video.currentTime - lap.sourceStart);
    schedule();
    $("videoStatus").textContent =
      `${lap.name}: ${lap.shift >= 0 ? "+" : ""}${lap.shift.toFixed(3)} s.`;
  });
  $(side ? "pairB" : "pairA").onchange = (e) => {
    const next = Number(e.target.value);
    if (next === pair[1 - side]) {
      e.target.value = String(pair[side]);
      $("videoStatus").textContent = "Scegli due dataset diversi.";
      return;
    }
    pair[side] = next;
    showPair();
  };
});
document.querySelectorAll("[data-step-video]").forEach(
  (button) =>
    (button.onclick = () => {
      const side = Number(button.dataset.stepVideo),
        video = videoFor(side),
        lap = laps[pair[side]];
      if (!lap || !video.videoWidth) return;
      const direction = Number(button.dataset.direction),
        fps = lap.sourceFPS || 30;
      video.pause();
      seeking[side] = null;
      video.currentTime = clamp(
        video.currentTime + direction / fps,
        0,
        video.duration,
      );
    }),
);
$("openAlignment").onclick = () => {
  if (laps.filter(Boolean).length < 2) {
    message("Apri almeno due dataset per allinearli dal video.");
    return;
  }
  pinCursor(state.cursor);
  pair = [laps.findIndex((l, i) => l && i !== state.dataset), state.dataset];
  refreshPair();
  $("videoDetails").open = true;
  showPair();
  $("videoDetails").scrollIntoView({ block: "start", behavior: "smooth" });
};
$("videoDetails").addEventListener("toggle", () => {
  if (!$("videoDetails").open) [0, 1].forEach((i) => videoFor(i).pause());
});
function validateDataset(data) {
  const input = data?.lap || data;
  if (!input || !Array.isArray(input.rows) || input.rows.length < 2)
    throw Error("Il set non contiene campioni validi.");
  let last = -Infinity,
    lastVideo = -Infinity;
  for (const row of input.rows) {
    if (
      !Array.isArray(row) ||
      row.length !== 8 ||
      !Number.isInteger(row[0]) ||
      row[0] < 0 ||
      !Number.isFinite(row[1]) ||
      row[1] < 0 ||
      !Number.isFinite(row[2]) ||
      row[2] < 0 ||
      row[2] < last ||
      row[1] < lastVideo ||
      row.slice(3).some((v) => v !== null && !Number.isFinite(v))
    )
      throw Error("Campioni non validi.");
    last = row[2];
    lastVideo = row[1];
  }
  if (
    !Number.isFinite(input.duration) ||
    input.duration < last ||
    input.duration <= 0 ||
    !Number.isFinite(input.sourceStart)
  )
    throw Error("Tempi del set non validi.");
  return structuredClone({
    ...input,
    video: data.video || input.video || null,
    shift: 0,
  });
}
function setSlot(i, data, color) {
  if (!Number.isInteger(i) || i < 0 || i > 63)
    throw Error("Dataset non valido.");
  const lap = data ? validateDataset(data) : null;
  laps[i] = lap;
  LAP_COLORS[i] = color || LAP_COLORS[i] || "#216bce";
  state.lapVisible[i] = true;
  state.dataset = i;
  fullView();
  updateAlignmentStatus();
  schedule();
  if ($("videoDetails").open) {
    refreshPair();
    showPair();
  }
}
function selectDataset(i) {
  state.dataset = i;
  schedule();
}
function setColor(i, color) {
  if (/^#[0-9a-f]{6}$/i.test(color)) {
    LAP_COLORS[i] = color;
    schedule();
  }
}
function download(blob, name) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
$("exportView").onclick = () => {
  const c = document.createElement("canvas");
  c.width = 1500;
  c.height = 700;
  drawScene(c.getContext("2d"), 1500, 700, true);
  c.toBlob((blob) => download(blob, "telemetria.png"));
};
window.addEventListener("resize", schedule);
window.telemetryChart = {
  laps,
  state,
  channels,
  lapColors: LAP_COLORS,
  setSlot,
  selectDataset,
  setColor,
  validateDataset,
  pinCursor,
  lapShift,
  fullView,
  setMode,
  setChannel,
  drawAll,
  configure(options) {
    resolveVideo = options.resolveVideo;
  },
  snapshot(i) {
    const lap = laps[i];
    if (!lap) throw Error("Scegli un set.");
    const copy = structuredClone(lap);
    delete copy.shift;
    delete copy.video;
    return {
      format: "driving-notes-dataset",
      version: 1,
      lap: copy,
      video: structuredClone(lap.video),
    };
  },
};
updateControls();
fullView();
updateAlignmentStatus();
