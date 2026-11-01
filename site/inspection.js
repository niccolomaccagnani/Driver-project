/* Review every stored row against its source frame; unreadable fields stay explicitly empty. */
(() => {
  const $ = (id) => document.getElementById(id),
    section = document.createElement("details");
  section.id = "dnReadCheck";
  section.className = "card section";
  section.innerHTML = `<summary style="font-weight:800;cursor:pointer">Verifica letture fotogramma per fotogramma</summary>
  <p class="muted">Apri un set per vedere l’immagine originale, le aree lette e i valori salvati. I campioni vuoti sono indicati come non letti.</p>
  <div class="toolbar"><label>Set<select id="dnInspectSet"></select></label><button id="dnInspectOpen" class="primary">Apri letture</button><button id="dnInspectCSV" class="light" disabled>Esporta tabella completa CSV</button></div>
  <p id="dnInspectStatus" role="status" aria-live="polite">Scegli un set salvato.</p>
  <canvas id="dnInspectFrame" style="display:block;width:100%;max-height:440px;object-fit:contain;background:#081525" tabindex="0" aria-label="Fotogramma originale con aree di lettura"></canvas>
  <div class="toolbar"><button id="dnInspectPrev" class="light" disabled>Fotogramma −</button><button id="dnInspectNext" class="light" disabled>Fotogramma +</button><output id="dnInspectTime"></output></div>
  <label>Fotogramma<input id="dnInspectSlider" type="range" min="0" max="0" value="0" disabled></label>
  <div id="dnInspectValues" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px"></div>`;
  $("dnTelemetry").insertBefore(section, $("dnTelemetryFrame"));
  let sets = [],
    item = null,
    source = null,
    index = 0,
    token = 0,
    controller = null;
  const labels = [
    ["speed", "Velocità", "km/h", 3],
    ["rpm", "RPM", "giri/min", 4],
    ["gear", "Marcia", "", 5],
    ["throttle", "Acceleratore / gas", "%", 6],
    ["brake", "Freno", "%", 7],
  ];
  function controls() {
    const count = item?.data.lap.rows.length || 0;
    $("dnInspectPrev").disabled = !count || index === 0;
    $("dnInspectNext").disabled = !count || index >= count - 1;
    $("dnInspectSlider").disabled = !count;
    $("dnInspectSlider").max = Math.max(0, count - 1);
    $("dnInspectSlider").value = index;
    $("dnInspectCSV").disabled = !count;
  }
  function showValues() {
    const row = item.data.lap.rows[index],
      root = $("dnInspectValues");
    root.replaceChildren();
    $("dnInspectTime").textContent =
      `Campione ${index + 1} / ${item.data.lap.rows.length} · frame ${row[0] + 1} · video ${row[1].toFixed(6)} s`;
    for (const [id, name, unit, col] of labels) {
      const card = document.createElement("div");
      card.className = "note";
      const title = document.createElement("strong");
      title.textContent = name;
      const value = document.createElement("p");
      value.textContent =
        row[col] === null ? "Non letto" : `${row[col]} ${unit}`;
      const crop = document.createElement("canvas");
      crop.id = "dnInspectCrop-" + id;
      crop.style.cssText =
        "width:100%;height:85px;object-fit:contain;background:#081525";
      crop.setAttribute("aria-label", "Area letta: " + name);
      const note = document.createElement("p");
      note.className = "muted";
      note.textContent =
        item.data.lap.extraction?.regions?.[id]?.kind === "bar"
          ? "Percentuale della barra visibile"
          : row[col] === null
            ? "Nessun valore salvato"
            : "Valore riconosciuto nel display";
      card.append(title, value, crop, note);
      root.append(card);
    }
    controls();
  }
  async function image() {
    const generation = ++token;
    controller?.abort();
    controller = new AbortController();
    const signal = controller.signal;
    if (!item) return;
    showValues();
    const display = $("dnInspectFrame");
    display.getContext("2d").clearRect(0, 0, display.width, display.height);
    if (!source) return;
    const row = item.data.lap.rows[index];
    let nativeIndex;
    if (item.data.lap.frameMode === "native") nativeIndex = row[0];
    else {
      nativeIndex = 0;
      while (
        nativeIndex + 1 < source.times.length &&
        source.times[nativeIndex + 1] <= row[1] + 0.00001
      )
        nativeIndex++;
    }
    try {
      $("dnInspectStatus").textContent = "Decodifica del fotogramma originale…";
      const decoded = await source.frameAt(nativeIndex, { signal });
      try {
        if (generation !== token) return;
        const full = document.createElement("canvas");
        source.draw(full, decoded.frame);
        const target = $("dnInspectFrame");
        target.width = full.width;
        target.height = full.height;
        const context = target.getContext("2d");
        context.drawImage(full, 0, 0);
        for (const [id, name] of labels) {
          const r = item.data.lap.extraction?.regions?.[id],
            crop = $("dnInspectCrop-" + id);
          if (
            !r ||
            ![r.x, r.y, r.w, r.h].every(Number.isFinite) ||
            r.x < 0 ||
            r.y < 0 ||
            r.w <= 0 ||
            r.h <= 0 ||
            r.x + r.w > 1.001 ||
            r.y + r.h > 1.001
          ) {
            crop.width = 180;
            crop.height = 60;
            continue;
          }
          const x = r.x * full.width,
            y = r.y * full.height,
            w = r.w * full.width,
            h = r.h * full.height;
          crop.width = Math.max(1, Math.round(w));
          crop.height = Math.max(1, Math.round(h));
          crop
            .getContext("2d")
            .drawImage(full, x, y, w, h, 0, 0, crop.width, crop.height);
          context.strokeStyle = r.kind === "bar" ? "#f4aa32" : "#46b7ff";
          context.lineWidth = Math.max(2, full.width / 700);
          context.strokeRect(x, y, w, h);
          context.fillStyle = context.strokeStyle;
          context.font = `bold ${Math.max(14, full.width / 80)}px system-ui`;
          context.fillText(name, x, Math.max(18, y - 4));
        }
        $("dnInspectStatus").textContent =
          item.data.lap.frameMode === "native"
            ? `Fotogramma originale decodificato · ${source.count} frame nel video. Valori salvati affiancati alle aree lette.`
            : "Questo set è campionato: l’immagine è il frame originale al tempo del campione. Rigenera in modalità originale per una riga per ogni frame.";
      } finally {
        decoded.frame.close();
      }
    } catch (error) {
      if (error.name !== "AbortError" && generation === token)
        $("dnInspectStatus").textContent =
          "Immagine non aperta: " + error.message;
    }
  }
  async function open(id) {
    const selected = sets.find((s) => s.id === (id || $("dnInspectSet").value));
    if (!selected) return;
    section.open = true;
    $("dnInspectSet").value = selected.id;
    item = structuredClone(selected);
    index = 0;
    source = null;
    controller?.abort();
    showValues();
    $("dnInspectStatus").textContent = "Apertura dell’onboard dal sito…";
    const generation = ++token;
    try {
      const binding = item.data.video,
        entries = driverTelemetry.entries(),
        matches = entries.filter(
          (v) =>
            v.name === binding?.name &&
            (!binding.size || v.size === binding.size),
        ),
        id =
          binding?.siteVideoId || (matches.length === 1 ? matches[0].id : null),
        file = id ? await loadVideo(id) : null;
      if (!file)
        throw Error(
          "Onboard originale non disponibile in questo browser. La tabella dei valori resta esportabile.",
        );
      const decoded = await DriverFrames.open(file);
      if (generation !== token) return;
      source = decoded;
      await image();
    } catch (error) {
      if (generation === token)
        $("dnInspectStatus").textContent = error.message;
    }
  }
  function setSets(list) {
    sets = list;
    const previous = $("dnInspectSet").value;
    $("dnInspectSet").replaceChildren(new Option("Scegli set…", ""));
    sets.forEach((s) =>
      $("dnInspectSet").add(new Option(s.data.lap.name, s.id)),
    );
    $("dnInspectSet").value = previous;
  }
  $("dnInspectOpen").onclick = () => open();
  $("dnInspectPrev").onclick = () => {
    if (index > 0) {
      index--;
      image();
    }
  };
  $("dnInspectNext").onclick = () => {
    if (index + 1 < item.data.lap.rows.length) {
      index++;
      image();
    }
  };
  $("dnInspectSlider").oninput = (e) => {
    index = Number(e.target.value);
    image();
  };
  $("dnInspectFrame").onkeydown = (e) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      $(e.key === "ArrowLeft" ? "dnInspectPrev" : "dnInspectNext").click();
    }
  };
  $("dnInspectCSV").onclick = () => {
    if (!item) return;
    const names = [
      "frame_index",
      "video_time_s",
      "lap_elapsed_s_est",
      "speed_kmh",
      "engine_rpm",
      "gear",
      "throttle_pct_est",
      "brake_pct_est",
    ];
    const csv = [
        names.join(","),
        ...item.data.lap.rows.map((row) =>
          row.map((v) => (v === null ? "" : v)).join(","),
        ),
      ].join("\r\n"),
      url = URL.createObjectURL(
        new Blob([csv], { type: "text/csv;charset=utf-8" }),
      ),
      a = document.createElement("a");
    a.href = url;
    a.download =
      item.data.lap.name.replace(/[\\/:*?"<>|]/g, "-") + "-fotogrammi.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  };
  window.DriverInspection = { setSets, open };
  driverTelemetry.refreshLibrary();
})();
