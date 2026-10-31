/* Driver Notes telemetry: automatic local OCR, persistent sets and an multi-set comparison. */
(() => {
  document
    .querySelectorAll('#dnTelemetry, .side [data-page="telemetry"]')
    .forEach((node) => node.remove());
  document.getElementById("view").hidden = false;
  const nav = document.createElement("button");
  nav.className = "nav";
  nav.dataset.page = "telemetry";
  nav.textContent = "▥   Telemetria";
  nav.onclick = () => navigate("telemetry");
  document.querySelector('.side [data-page="settings"]').before(nav);
  const section = document.createElement("section");
  section.id = "dnTelemetry";
  section.hidden = true;
  section.innerHTML = `<h1>Telemetria</h1><p class="muted">Scegli un onboard, genera il suo set e confrontalo con gli altri giri.</p>
  <section class="card section"><h2>Genera dati dall’onboard</h2>
    <div class="fieldrow"><label>Pista<select id="dnTrack"></select></label><label>Video<select id="dnVideo"></select></label></div>
    <div class="toolbar"><button id="dnGenerate" class="primary">Genera dati</button><button id="dnCancel" class="light" disabled>Interrompi analisi</button>
    <label style="margin:0;display:flex;gap:8px;align-items:center"><input id="dnAutomatic" type="checkbox" checked style="width:auto">Analizza automaticamente i video esistenti e i nuovi caricamenti</label></div>
    <p id="dnOCRProgress" role="status" aria-live="polite">Preparazione dell’archivio…</p><progress id="dnOCRBar" max="1" value="0" style="width:100%"></progress>
    <p class="muted">I set automatici usano il nome dell’onboard. I canali non leggibili vengono segnalati, senza inventare valori.
    Il campionamento è a 30 Hz. I valori sono letture OCR del display, non telemetria ECU. L’analisi continua finché il sito resta aperto.</p>
    <details id="dnCalibration"><summary>Regola lettura · se un valore visibile non viene riconosciuto</summary>
      <p class="muted">Apri l’anteprima, scegli un canale e trascina un rettangolo intorno alle sole cifre. Per pedali rappresentati solo da barre non vengono stimati valori numerici.</p>
      <div class="toolbar"><button id="dnPreview" class="light">Apri anteprima del video</button><label>Canale<select id="dnROIChannel"><option value="speed">Velocità</option><option value="rpm">Giri motore</option><option value="gear">Marcia</option><option value="throttle">Acceleratore %</option><option value="brake">Freno %</option></select></label><button id="dnClearROI" class="light">Azzera aree</button></div>
      <video id="dnPreviewVideo" controls muted playsinline style="width:100%;max-height:250px"></video>
      <canvas id="dnROICanvas" style="width:100%;max-width:100%;touch-action:none;cursor:crosshair"></canvas><p id="dnROIStatus" class="muted"></p>
    </details>
  </section>
  <details class="card section" id="dnLibrary"><summary style="cursor:pointer;font-weight:800">Set salvati e stato delle analisi</summary><div class="toolbar"><label class="light">Importa set JSON<input id="dnImport" type="file" accept=".json,application/json"></label></div><div id="dnLibraryItems"></div></details>
  <section class="card section"><div class="flex between"><h2>Confronto</h2><button id="dnAddDataset" class="primary" aria-label="Aggiungi dataset">+ Aggiungi dataset</button></div>
  <div id="dnSlots"></div><p class="muted">Scegli il set e il colore di ogni dataset. Il dataset selezionato è quello spostato con Alt+S.</p></section>
  <iframe id="dnTelemetryFrame" title="Grafico di telemetria" style="width:100%;height:1500px;border:0;border-radius:8px;background:white;margin-top:16px"></iframe>`;
  document.querySelector(".main").append(section);
  const el = (id) => document.getElementById(id);
  const status = (text) => {
    el("dnOCRProgress").textContent = text;
  };
  let ready = false,
    sets = [],
    jobs = [],
    busy = false,
    controller = null,
    refreshToken = 0,
    previewURL = null,
    regions = {},
    regionVideo = null;
  const slots = [{ id: "", color: "#216bce" }],
    queue = [],
    queued = new Set();
  let auto = true;
  try {
    auto = localStorage.getItem("driver-notes-telemetry-auto-v1") !== "off";
  } catch {}
  el("dnAutomatic").checked = auto;
  const chart = () => el("dnTelemetryFrame").contentWindow.telemetryChart;
  const entries = () =>
    state.tracks.flatMap((t) =>
      (t.videos || []).map((v) => ({ ...v, track: t })),
    );
  const colorAt = (i) =>
    i === 0
      ? "#216bce"
      : i === 1
        ? "#e07825"
        : hslToHex((i * 137.508) % 360, 70, 43);
  function hslToHex(h, s, l) {
    s /= 100;
    l /= 100;
    const a = s * Math.min(l, 1 - l),
      f = (n) => {
        const k = (n + h / 30) % 12;
        return Math.round(
          255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))),
        )
          .toString(16)
          .padStart(2, "0");
      };
    return "#" + f(0) + f(8) + f(4);
  }
  function database() {
    return new Promise((resolve, reject) => {
      const r = indexedDB.open("driver-notes-telemetry-v1", 2);
      r.onupgradeneeded = () => {
        for (const key of ["sets", "analyses"])
          if (!r.result.objectStoreNames.contains(key))
            r.result.createObjectStore(key, { keyPath: "id" });
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  async function store(table, operation, value) {
    const d = await database();
    try {
      return await new Promise((resolve, reject) => {
        const tx = d.transaction(
            table,
            operation === "getAll" || operation === "get"
              ? "readonly"
              : "readwrite",
          ),
          r = tx.objectStore(table)[operation](value);
        tx.oncomplete = () => resolve(r.result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } finally {
      d.close();
    }
  }
  function refreshVideos() {
    const select = el("dnTrack"),
      previous = select.value || trackId;
    select.replaceChildren(new Option("Scegli pista…", ""));
    state.tracks.forEach((t) => select.add(new Option(t.name, t.id)));
    select.value = state.tracks.some((t) => t.id === previous) ? previous : "";
    const video = el("dnVideo"),
      selected = video.value;
    video.replaceChildren(new Option("Scegli onboard…", ""));
    entries()
      .filter((v) => v.track.id === select.value)
      .forEach((v) => video.add(new Option(v.name, v.id)));
    video.value = selected;
    el("dnGenerate").disabled = !video.value;
  }
  function renderSlots() {
    const root = el("dnSlots");
    root.replaceChildren();
    slots.forEach((slot, i) => {
      const row = document.createElement("div");
      row.className = "flex";
      row.style.cssText = "gap:12px;margin:14px 0;align-items:center";
      const active = document.createElement("input");
      active.type = "radio";
      active.name = "dnSelectedDataset";
      active.style.width = "auto";
      active.checked = ready ? chart().state.dataset === i : i === 0;
      active.setAttribute("aria-label", `Seleziona dataset ${i + 1}`);
      active.onchange = () => {
        if (ready) chart().selectDataset(i);
      };
      const label = document.createElement("strong");
      label.textContent = `Dataset ${i + 1}`;
      const select = document.createElement("select");
      select.style.cssText = "flex:1;min-width:140px";
      select.setAttribute("aria-label", `Apri set nel dataset ${i + 1}`);
      select.add(new Option("Apri un set salvato…", ""));
      sets.forEach((item) =>
        select.add(
          new Option(
            `${item.trackName ? item.trackName + " · " : ""}${item.data.lap.name}`,
            item.id,
          ),
        ),
      );
      select.value = slot.id;
      select.onchange = () => {
        slot.id = select.value;
        const item = sets.find((s) => s.id === slot.id);
        if (ready) chart().setSlot(i, item?.data || null, slot.color);
        renderSlots();
      };
      const color = document.createElement("input");
      color.type = "color";
      color.value = slot.color;
      color.style.cssText = "width:48px;height:40px;padding:3px";
      color.setAttribute("aria-label", `Colore dataset ${i + 1}`);
      color.oninput = () => {
        slot.color = color.value;
        if (ready) chart().setColor(i, color.value);
      };
      row.append(active, label, select, color);
      root.append(row);
    });
  }
  async function refreshLibrary() {
    const token = ++refreshToken;
    try {
      const [saved, analyses] = await Promise.all([
        store("sets", "getAll"),
        store("analyses", "getAll"),
      ]);
      if (token !== refreshToken) return;
      sets = saved
        .filter((s) => s.data?.lap)
        .sort((a, b) => b.updated - a.updated);
      jobs = analyses;
      renderSlots();
      const root = el("dnLibraryItems");
      root.replaceChildren();
      if (!sets.length && !jobs.length)
        root.textContent =
          "Nessun set salvato. I risultati delle analisi compariranno qui.";
      for (const item of sets) {
        const row = document.createElement("div");
        row.className = "note";
        const title = document.createElement("strong");
        title.textContent = item.data.lap.name;
        const info = document.createElement("p");
        info.className = "muted";
        info.textContent = `${item.trackName || "Pista non indicata"} · ${item.data.lap.rows.length.toLocaleString("it-IT")} campioni · ${item.data.lap.sampleRate || "?"} Hz${item.missing?.length ? " · Non letti: " + item.missing.join(", ") : ""}`;
        const coverage = document.createElement("p");
        coverage.className = "muted";
        coverage.textContent = item.coverage
          ? DriverOCR.fields
              .map(
                (f) =>
                  `${f.name}: ${Math.round((item.coverage[f.id] || 0) * 100)}% campioni accettati`,
              )
              .join(" · ")
          : "";
        const actions = document.createElement("div");
        actions.className = "flex";
        const rename = document.createElement("button");
        rename.className = "light";
        rename.textContent = "Rinomina";
        rename.onclick = async () => {
          const name = prompt("Nome del set:", item.data.lap.name);
          if (!name?.trim()) return;
          item.data.lap.name = name.trim().slice(0, 100);
          await store("sets", "put", item);
          await refreshLibrary();
        };
        const exportButton = document.createElement("button");
        exportButton.className = "light";
        exportButton.textContent = "Esporta JSON";
        exportButton.onclick = () =>
          download(item.data, `${item.data.lap.name}.json`);
        const remove = document.createElement("button");
        remove.className = "danger";
        remove.textContent = "Elimina set";
        remove.onclick = async () => {
          if (!confirm("Eliminare il set? L’onboard resta nel circuito."))
            return;
          await store("sets", "delete", item.id);
          slots.forEach((s, i) => {
            if (s.id === item.id) {
              s.id = "";
              if (ready) chart().setSlot(i, null, s.color);
            }
          });
          await refreshLibrary();
        };
        const regenerate = document.createElement("button");
        regenerate.className = "light";
        regenerate.textContent = "Rigenera dal video";
        regenerate.onclick = () => {
          const binding = item.data.video,
            candidates = entries().filter(
              (v) =>
                v.name === binding?.name &&
                (!binding.size || v.size === binding.size),
            );
          const entry =
            entries().find((v) => v.id === binding?.siteVideoId) ||
            (candidates.length === 1 ? candidates[0] : null);
          if (!entry) {
            status(
              "L’onboard originale di questo set non è disponibile nel sito. Ricaricalo nella pagina del circuito.",
            );
            return;
          }
          enqueue(entry, false, { id: item.id, name: item.data.lap.name });
        };
        const quality = document.createElement("p");
        quality.className = "muted";
        quality.textContent =
          (item.data.lap.extraction?.engineVersion || 0) < DriverOCR.version
            ? "Lettura precedente: usa Rigenera dal video per applicare le correzioni."
            : "Le percentuali indicano i campioni accettati dall’OCR, non l’accuratezza rispetto al video.";
        actions.append(regenerate, rename, exportButton, remove);
        if (item.previousData) {
          const previous = document.createElement("button");
          previous.className = "light";
          previous.textContent = "Esporta lettura precedente";
          previous.onclick = () =>
            download(
              item.previousData,
              `${item.data.lap.name}-precedente.json`,
            );
          actions.append(previous);
        }
        row.append(title, info, coverage, quality, actions);
        root.append(row);
      }
      for (const job of jobs.filter((j) => j.status !== "done")) {
        const row = document.createElement("div");
        row.className = "note";
        const text = document.createElement("p");
        text.textContent = `${job.name}: ${job.message || job.status}`;
        row.append(text);
        root.append(row);
      }
    } catch (error) {
      status("Archivio telemetria non disponibile: " + error.message);
    }
  }
  function download(data, name) {
    const url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
      ),
      a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
  async function videoFor(binding) {
    if (!binding) return null;
    const candidates = entries().filter(
      (v) =>
        v.name === binding.name && (!binding.size || v.size === binding.size),
    );
    const id =
      binding.siteVideoId ||
      (candidates.length === 1 ? candidates[0].id : null);
    return id ? await loadVideo(id) : null;
  }
  function enqueue(entry, manual = false, targetSet = null) {
    if (queued.has(entry.id)) {
      if (manual || targetSet)
        status(
          "Questo onboard è già in analisi o in coda. Attendi il completamento.",
        );
      return;
    }
    queue.push({
      id: entry.id,
      manual,
      targetSet,
      regions:
        manual && regionVideo === entry.id ? structuredClone(regions) : null,
    });
    queued.add(entry.id);
    pump();
  }
  async function scan() {
    if (!auto) {
      if (!busy)
        status(
          "Analisi automatica disattivata. Scegli pista e video, poi Genera dati.",
        );
      return;
    }
    try {
      const existing = await store("analyses", "getAll");
      if (!entries().length && !busy)
        status(
          "Nessun onboard archiviato. Carica un video nella pagina del circuito.",
        );
      else if (!busy && !queue.length && existing.length === entries().length)
        status(
          "Analisi archiviate. Apri i set salvati oppure scegli un video da rileggere.",
        );
      for (const entry of entries()) {
        const job = existing.find((j) => j.id === entry.id);
        if (
          !job ||
          job.version !== DriverOCR.version ||
          job.size !== entry.size ||
          job.status === "running" ||
          job.status === "interrupted"
        )
          enqueue(entry);
      }
    } catch (error) {
      status("Analisi automatica non disponibile: " + error.message);
    }
  }
  async function pump() {
    if (busy) return;
    busy = true;
    while (queue.length) {
      const task = queue.shift(),
        entry = entries().find((e) => e.id === task.id);
      if (!entry) {
        queued.delete(task.id);
        continue;
      }
      controller = new AbortController();
      el("dnCancel").disabled = false;
      const job = {
        id: entry.id,
        name: entry.name,
        size: entry.size,
        version: DriverOCR.version,
        status: "running",
        message: "Analisi in corso",
        updated: Date.now(),
      };
      try {
        await store("analyses", "put", job);
        await refreshLibrary();
        const file = await loadVideo(entry.id);
        if (!file) throw Error("File non disponibile in questo browser.");
        const result = await DriverOCR.analyze(file, {
          signal: controller.signal,
          regions: task.regions,
          onProgress: (p) => {
            status(
              `${entry.name} · ${p.phase}${p.total ? " · " + p.time.toFixed(1) + " / " + p.total.toFixed(1) + " s" : ""} · ${queue.length} in coda`,
            );
            el("dnOCRBar").value = p.progress || 0;
          },
        });
        if (result.lap) {
          let name = task.targetSet?.name || entry.name;
          if (task.manual) {
            const answer = prompt(
              "Con quale nome vuoi salvare il set?",
              entry.name,
            );
            if (answer === null) {
              job.status = "cancelled";
              job.message = "Analisi completata, salvataggio annullato.";
              await store("analyses", "put", job);
              continue;
            }
            if (answer.trim()) name = answer.trim().slice(0, 100);
          }
          result.lap.name = name;
          const data = {
            format: "driving-notes-dataset",
            version: 1,
            lap: result.lap,
            video: {
              siteVideoId: entry.id,
              name: entry.name,
              size: entry.size,
              lastModified: file.lastModified || null,
            },
          };
          // Reanalysis replaces the automatic result; manually named sets remain independent.
          const savedId =
            task.targetSet?.id || (task.manual ? uid() : "auto:" + entry.id);
          const previous = await store("sets", "get", savedId);
          if (task.targetSet && !previous) {
            job.status = "cancelled";
            job.message =
              "Set eliminato durante l’analisi: nessun dato riscritto.";
            await store("analyses", "put", job);
            continue;
          }
          if (task.targetSet) {
            name = previous.data.lap.name;
            data.lap.name = name;
          }
          await store("sets", "put", {
            id: savedId,
            previousData: previous?.data || null,
            data,
            trackId: entry.track.id,
            trackName: entry.track.name,
            updated: Date.now(),
            missing: result.missing,
            coverage: result.coverage,
            quality: result.quality,
          });
          if (ready) {
            const api = chart(),
              savedView = {
                min: api.state.min,
                max: api.state.max,
                cursor: api.state.cursor,
                cursorLocked: api.state.cursorLocked,
                dataset: api.state.dataset,
              };
            slots.forEach((slot, index) => {
              if (slot.id === savedId) {
                const shift = api.laps[index]?.shift || 0;
                api.setSlot(index, data, slot.color);
                api.laps[index].shift = shift;
              }
            });
            Object.assign(api.state, savedView);
            api.drawAll();
          }
          job.status = "done";
          job.message = `Set salvato: ${name}${result.reason ? " · " + result.reason : ""}`;
        } else {
          job.status = "unreadable";
          job.message = result.reason;
        }
        job.regions = result.regions;
        job.missing = result.missing;
        job.coverage = result.coverage;
        await store("analyses", "put", job);
        status(`${entry.name} · ${job.message}`);
      } catch (error) {
        job.status = error.name === "AbortError" ? "interrupted" : "error";
        job.message =
          error.name === "AbortError"
            ? "Analisi interrotta. Premi Genera dati per riprovare."
            : error.message;
        await store("analyses", "put", job).catch(() => {});
        status(`${entry.name} · ${job.message}`);
      } finally {
        queued.delete(task.id);
        controller = null;
        el("dnCancel").disabled = true;
        await refreshLibrary();
      }
    }
    busy = false;
    DriverOCR.release();
  }
  el("dnTrack").onchange = () => {
    el("dnVideo").value = "";
    refreshVideos();
  };
  el("dnVideo").onchange = () => {
    el("dnGenerate").disabled = !el("dnVideo").value;
  };
  el("dnGenerate").onclick = () => {
    const entry = entries().find((v) => v.id === el("dnVideo").value);
    if (entry) enqueue(entry, true);
  };
  el("dnCancel").onclick = () => {
    controller?.abort();
    queue.splice(0).forEach((task) => queued.delete(task.id));
  };
  el("dnAutomatic").onchange = () => {
    auto = el("dnAutomatic").checked;
    try {
      localStorage.setItem(
        "driver-notes-telemetry-auto-v1",
        auto ? "on" : "off",
      );
    } catch {}
    if (auto) scan();
    else {
      for (let i = queue.length - 1; i >= 0; i--)
        if (!queue[i].manual) {
          queued.delete(queue[i].id);
          queue.splice(i, 1);
        }
    }
  };
  el("dnAddDataset").onclick = () => {
    if (slots.length >= 64) {
      status("Il confronto supporta fino a 64 dataset.");
      return;
    }
    slots.push({ id: "", color: colorAt(slots.length) });
    renderSlots();
  };
  el("dnImport").onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      if (file.size > 32 * 1024 * 1024) throw Error("Il file supera 32 MB.");
      if (!ready) throw Error("Attendi il caricamento del grafico.");
      const data = JSON.parse(await file.text());
      chart().validateDataset(data);
      if (!data.lap) throw Error("Importa un singolo set JSON.");
      await store("sets", "put", {
        id: uid(),
        data,
        updated: Date.now(),
        trackName: "",
      });
      await refreshLibrary();
    } catch (error) {
      status("Set non importato: " + error.message);
    } finally {
      e.target.value = "";
    }
  };
  // Optional calibration only helps HUD formats that cannot be detected from their labels.
  const preview = el("dnPreviewVideo"),
    canvas = el("dnROICanvas"),
    context = canvas.getContext("2d");
  let drag = null;
  function drawPreview() {
    if (!preview.videoWidth) return;
    canvas.width = Math.min(1280, preview.videoWidth);
    canvas.height = Math.round(
      (preview.videoHeight * canvas.width) / preview.videoWidth,
    );
    context.drawImage(preview, 0, 0, canvas.width, canvas.height);
    context.lineWidth = 3;
    context.strokeStyle = "#e82750";
    Object.entries(regions).forEach(([id, r]) => {
      context.strokeRect(
        r.x * canvas.width,
        r.y * canvas.height,
        r.w * canvas.width,
        r.h * canvas.height,
      );
      context.fillStyle = "#e82750";
      context.font = "18px system-ui";
      context.fillText(
        id,
        r.x * canvas.width,
        Math.max(20, r.y * canvas.height - 5),
      );
    });
  }
  el("dnPreview").onclick = async () => {
    const entry = entries().find((v) => v.id === el("dnVideo").value);
    if (!entry) {
      status("Scegli pista e video.");
      return;
    }
    try {
      const file = await loadVideo(entry.id);
      if (!file) throw Error("Video non disponibile.");
      if (previewURL) URL.revokeObjectURL(previewURL);
      previewURL = URL.createObjectURL(file);
      if (regionVideo !== entry.id) regions = {};
      regionVideo = entry.id;
      preview.src = previewURL;
      preview.load();
    } catch (error) {
      status(error.message);
    }
  };
  preview.onloadeddata = drawPreview;
  preview.onseeked = drawPreview;
  preview.onpause = drawPreview;
  const point = (e) => {
    const r = canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
      y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
    };
  };
  canvas.onpointerdown = (e) => {
    if (!preview.videoWidth) return;
    preview.pause();
    drag = point(e);
    canvas.setPointerCapture(e.pointerId);
  };
  canvas.onpointerup = (e) => {
    if (!drag) return;
    const end = point(e),
      r = {
        x: Math.min(drag.x, end.x),
        y: Math.min(drag.y, end.y),
        w: Math.abs(end.x - drag.x),
        h: Math.abs(end.y - drag.y),
      };
    drag = null;
    if (r.w < 0.003 || r.h < 0.003) return;
    regions[el("dnROIChannel").value] = r;
    drawPreview();
    el("dnROIStatus").textContent =
      "Aree impostate: " +
      Object.keys(regions).join(", ") +
      ". Premi Genera dati per rileggere il video.";
  };
  canvas.onpointercancel = () => {
    drag = null;
  };
  el("dnClearROI").onclick = () => {
    regions = {};
    drawPreview();
  };
  document.addEventListener("keydown", (event) => {
    if (
      page !== "telemetry" ||
      !ready ||
      !event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.code !== "KeyS"
    )
      return;
    if (
      event.target.closest?.(
        "textarea,select,[contenteditable=true],input:not([type=radio]):not([type=checkbox])",
      )
    )
      return;
    event.preventDefault();
    if (!event.repeat)
      chart().setMode(chart().state.mode === "dataset" ? "zoom" : "dataset");
    el("dnTelemetryFrame").contentDocument.getElementById("plot").focus();
  });
  const frame = el("dnTelemetryFrame");
  let initialized = false;
  frame.addEventListener("load", () => {
    if (!frame.contentWindow.telemetryChart) return;
    ready = true;
    chart().configure({ resolveVideo: videoFor });
    renderSlots();
  });
  const previousRender = render;
  render = function () {
    const active = page === "telemetry";
    section.hidden = !active;
    el("view").hidden = active;
    if (active) {
      if (!initialized) {
        initialized = true;
        frame.srcdoc = JSON.parse(el("dnTelemetryDocument").textContent);
      }
      refreshVideos();
      refreshLibrary();
      return;
    }
    if (ready)
      frame.contentDocument.querySelectorAll("video").forEach((v) => v.pause());
    return previousRender.apply(this, arguments);
  };
  const originalAddVideo = addVideo;
  addVideo = async function () {
    const result = await originalAddVideo.apply(this, arguments);
    refreshVideos();
    await scan();
    return result;
  };
  refreshVideos();
  refreshLibrary();
  // No analysis starts until startup scripts have finished restoring the existing archive.
  setTimeout(scan, 300);
  window.driverTelemetry = {
    scan,
    enqueue,
    refreshLibrary,
    entries,
    slots,
    chart,
    database,
    store,
    get busy() {
      return busy;
    },
  };
})();
