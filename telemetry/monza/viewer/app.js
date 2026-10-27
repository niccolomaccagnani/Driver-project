"use strict";
const DATA = JSON.parse(document.getElementById("telemetry").textContent);
const $ = (id) => document.getElementById(id);
const laps = DATA.laps;
const LAP_COLORS = ["#216bce", "#e07825"];
const channels = [
  {
    id: "speed",
    name: "Velocità",
    short: "Vel.",
    unit: "km/h",
    col: 3,
    min: 0,
    max: 350,
    ticks: [0, 50, 100, 150, 200, 250, 300, 350],
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
    max: 10000,
    ticks: [0, 2500, 5000, 7500, 10000],
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
    max: 6,
    ticks: [0, 1, 2, 3, 4, 5, 6],
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
  max: 93.07,
  offset: 0,
  cursor: 0,
  active: "speed",
  mode: "zoom",
  lapVisible: [true, true],
  drag: null,
};
const cv = $("plot"),
  sourceURLs = {};
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
        "monza-single-chart-v1",
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
  const saved = JSON.parse(localStorage.getItem("monza-single-chart-v1"));
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
  card.innerHTML = `<div class="channel-title"><input type="checkbox" checked aria-label="Mostra ${ch.name}"><button type="button">${ch.name}</button></div><div class="channel-values"><span class="g4"><i></i><b>—</b></span><span class="g6"><i></i><b>—</b><small>${ch.unit}</small></span></div>`;
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
function bounds() {
  return [
    Math.min(0, state.offset),
    Math.max(laps[0].duration, laps[1].duration + state.offset),
  ];
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
  state.cursor = clamp(state.cursor, state.min, state.max);
  message("");
  schedule();
  return true;
}
function fullView() {
  setRange(...bounds());
}
function setOffset(value, { preserveRange = false } = {}) {
  if (!Number.isFinite(value) || Math.abs(value) > 120) {
    message("Usa uno spostamento fra −120 e +120 secondi.");
    return false;
  }
  const old = bounds(),
    wasFull =
      Math.abs(state.min - old[0]) < 0.02 &&
      Math.abs(state.max - old[1]) < 0.02;
  state.offset = value;
  $("alignmentStatus").textContent =
    value === 0
      ? "Partenze allineate dal cronometro HUD."
      : `Giro 6: ${value > 0 ? "+" : ""}${value.toFixed(3)} s, verso ${value > 0 ? "destra" : "sinistra"}. Durate invariate.`;
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
  const t = x - (lap ? state.offset : 0);
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
    left: 12 + rulers.length * (compact ? 52 : 54),
    right: w - 16,
    top: 58,
    bottom: h - 34,
    rulers,
    rulerWidth: compact ? 52 : 54,
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
    c.fillText(ch.unit, x + g.rulerWidth / 2, 33);
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
      c.font = "10px system-ui";
      c.fillText(tick, axis - 5, y);
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
    for (let lap = 0; lap < 2; lap++) {
      if (!state.lapVisible[lap]) continue;
      c.strokeStyle = LAP_COLORS[lap];
      c.lineWidth = ch === selected ? 2 : 1.45;
      c.globalAlpha = 1;
      c.setLineDash([]);
      c.beginPath();
      let previous = null;
      for (const r of laps[lap].rows) {
        const t = r[2] + (lap ? state.offset : 0),
          value = r[ch.col];
        if (value === null || t < state.min - 0.2 || t > state.max + 0.2) {
          previous = null;
          continue;
        }
        if (!previous || r[2] - previous.time > 0.15)
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
    c.lineWidth = 1;
    c.setLineDash([3, 4]);
    c.beginPath();
    c.moveTo(X(state.cursor), g.top);
    c.lineTo(X(state.cursor), g.bottom);
    c.stroke();
    c.setLineDash([]);
    for (const ch of ordered)
      for (let lap = 0; lap < 2; lap++) {
        if (!state.lapVisible[lap]) continue;
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
  $("cursorReadout").textContent = state.cursor.toFixed(3) + " s";
  for (const ch of channels)
    for (let lap = 0; lap < 2; lap++) {
      const value = nearestValue(lap, ch, state.cursor);
      ch.values[lap].textContent = !state.lapVisible[lap]
        ? "nascosto"
        : value === null
          ? "—"
          : value.toFixed(ch.col >= 6 ? 1 : 0);
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
    state.cursor = clamp(t, state.min, state.max);
    state.drag =
      state.mode === "dataset"
        ? {
            mode: "dataset",
            startX: p.x,
            offset: state.offset,
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
  if (!ruler && p.x >= g.left && p.x <= g.right) {
    state.cursor = clamp(pointerTime(p.x), state.min, state.max);
    schedule();
  }
});
function endPointer(e) {
  const d = state.drag;
  if (!d) return;
  state.drag = null;
  if (d.mode === "zoom" && Math.abs(pointer(e).x - d.startX) > 7)
    setRange(Math.min(d.start, d.end), Math.max(d.start, d.end));
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
      ? "Trascina orizzontalmente il giro 6 arancione · Alt+S o Esc per tornare alla selezione"
      : mode === "move"
        ? "Trascina verticalmente il canale selezionato · Le scale a sinistra regolano la sua ampiezza"
        : "Trascina sul grafico per ingrandire · Maiusc + trascina: scorri · Doppio clic: giro intero";
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
$("resetOffset").onclick = () => setOffset(0);
$("openAlignment").onclick = () => {
  const panel = $("videoDetails");
  panel.open = true;
  $("openAlignment").setAttribute("aria-expanded", "true");
  panel.scrollIntoView({ block: "start", behavior: "smooth" });
};
$("closeAlignment").onclick = () => {
  $("videoDetails").open = false;
  $("openAlignment").setAttribute("aria-expanded", "false");
  $("openAlignment").focus();
};
$("videoDetails").addEventListener("toggle", () =>
  $("openAlignment").setAttribute(
    "aria-expanded",
    String($("videoDetails").open),
  ),
);
$("lapA").onchange = (e) => {
  state.lapVisible[0] = e.target.checked;
  schedule();
};
$("lapB").onchange = (e) => {
  state.lapVisible[1] = e.target.checked;
  schedule();
};
function download(blob, name) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
function csvCell(value) {
  return value === null || value === undefined
    ? ""
    : String(value).includes(",") || String(value).includes('"')
      ? '"' + String(value).replaceAll('"', '""') + '"'
      : String(value);
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
  download(
    new Blob([rows.map((row) => row.map(csvCell).join(",")).join("\r\n")], {
      type: "text/csv;charset=utf-8",
    }),
    "monza-confronto.csv",
  );
};
$("exportView").onclick = () => {
  const out = document.createElement("canvas"),
    w = Math.max(1200, Math.round(cv.getBoundingClientRect().width)),
    h = 680;
  out.width = w;
  out.height = h + 145;
  const c = out.getContext("2d");
  c.fillStyle = "white";
  c.fillRect(0, 0, w, out.height);
  c.fillStyle = "#172b46";
  c.font = "bold 24px system-ui";
  c.fillText("Monza · confronto telemetria", 22, 32);
  c.font = "12px system-ui";
  c.fillText(
    `Giro 4: blu · Giro 6: arancione · Spostamento giro 6: ${state.offset.toFixed(3)} s`,
    22,
    58,
  );
  c.save();
  c.translate(0, 76);
  drawScene(c, w, h, true);
  c.restore();
  c.fillStyle = "#6f7f92";
  c.font = "11px system-ui";
  c.fillText(
    "Scale verticali indipendenti · Pedali stimati · Asse X: tempo nel giro · Letture mancanti lasciate vuote",
    22,
    h + 126,
  );
  out.toBlob((blob) => download(blob, "monza-confronto.png"), "image/png");
};
function loadVideo(input, video, key) {
  input.onchange = () => {
    const file = input.files[0];
    if (!file) return;
    if (sourceURLs[key]) URL.revokeObjectURL(sourceURLs[key]);
    sourceURLs[key] = URL.createObjectURL(file);
    video.src = sourceURLs[key];
    video.load();
  };
  video.addEventListener("error", () =>
    message("Video non leggibile: prova Safari sul Mac o una copia MP4 H.264."),
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
  });
}
document.querySelectorAll("[data-step-video]").forEach(
  (button) =>
    (button.onclick = () => {
      const key = button.dataset.stepVideo,
        video = $("video" + key),
        lap = key === "A" ? 0 : 1,
        direction = Number(button.dataset.direction);
      if (!video.videoWidth) {
        message("Apri prima un video leggibile.");
        return;
      }
      video.pause();
      const row =
        direction > 0
          ? laps[lap].rows.find((r) => r[1] > video.currentTime + 0.004)
          : laps[lap].rows.findLast((r) => r[1] < video.currentTime - 0.004);
      video.currentTime = clamp(
        row ? row[1] : video.currentTime + direction / 30,
        0,
        video.duration,
      );
    }),
);
$("alignVideos").onclick = () => {
  const a = $("videoA"),
    b = $("videoB");
  if (!a.videoWidth || !b.videoWidth) {
    message("Apri entrambi i video per allineare i fotogrammi.");
    return;
  }
  const ta = a.currentTime - laps[0].sourceStart,
    tb = b.currentTime - laps[1].sourceStart;
  setOffset(ta - tb);
  $("videoAlignmentStatus").textContent =
    "Riferimenti allineati. Torna al grafico per confrontare i giri.";
};
$("syncVideos").onclick = () => {
  [$("videoA"), $("videoB")].forEach((video, i) => {
    if (video.videoWidth) {
      video.pause();
      video.currentTime = clamp(
        state.cursor - (i ? state.offset : 0) + laps[i].sourceStart,
        0,
        video.duration,
      );
    }
  });
};
window.addEventListener("resize", schedule);
window.monzaViewer = {
  state,
  laps,
  channels,
  setRange,
  setOffset,
  fullView,
  nearestValue,
  drawAll,
  setChannel,
  setMode,
  lapColors: LAP_COLORS,
  selectChannel,
  channelY,
};
updateControls();
fullView();
