/* Integrate with the existing trackbook databases; no video copies are made. */
(() => {
  // A website downloaded from Settings may contain the previously rendered section.
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
  section.innerHTML = `<h1>Telemetria</h1><p class="muted">Confronta i giri e allineali con gli onboard già salvati nel sito.</p>
    <section class="card section"><h2>Onboard del sito</h2>
    <label>Circuito<select id="dnTelemetryTrack"></select></label>
    <div class="fieldrow"><label>Video del giro blu<select id="dnTelemetryVideoA"></select></label>
    <label>Video del giro arancione<select id="dnTelemetryVideoB"></select></label></div>
    <p class="muted">Scegli il video da cui provengono i dati di ciascun giro. È disponibile direttamente per l’allineamento.
    Per aggiungere onboard apri il circuito nella Home. La lettura automatica di nuovi video non è ancora inclusa.</p>
    <p id="dnTelemetryStatus" role="status" aria-live="polite"></p></section>
    <details class="card section" id="dnTelemetrySets"><summary style="cursor:pointer;font-weight:800">Libreria dei set · salva o apri un giro</summary>
    <div class="fieldrow"><label>Giro<select id="dnTelemetrySlot"><option value="0">Blu</option><option value="1">Arancione</option></select></label>
    <label>Nome del set<input id="dnTelemetryName" maxlength="100" placeholder="Es. Monza · F2 · giro 1"></label></div>
    <div class="toolbar"><button id="dnTelemetrySave" class="primary">Salva set nel sito</button></div>
    <div id="dnTelemetryLibrary"></div>
    <p class="muted">I set restano in questo browser. Usa anche Salva singolo set JSON nel pannello Dati per una copia esterna.
    Gli onboard restano nell’archivio del circuito, senza duplicarli.</p></details>
    <p class="muted" id="dnTelemetryDemo">Dati iniziali: due giri di esempio a Monza. Apri i tuoi set in Dati oppure dalla libreria.</p>
    <iframe id="dnTelemetryFrame" title="Grafico interattivo di telemetria" style="width:100%;height:1450px;border:0;border-radius:8px;background:white;margin-top:16px"></iframe>`;
  document.querySelector(".main").append(section);
  const el = (id) => document.getElementById(id);
  const status = (text) => {
    el("dnTelemetryStatus").textContent = text;
  };
  let ready = false,
    rows = [],
    generation = 0;
  const revisions = [0, 0];
  const viewer = () => el("dnTelemetryFrame").contentWindow.monzaViewer;
  const videoEntries = () =>
    state.tracks.flatMap((t) =>
      (t.videos || []).map((v) => ({ ...v, track: t })),
    );
  function refreshVideos() {
    const select = el("dnTelemetryTrack"),
      previous = select.value || trackId;
    select.replaceChildren(new Option("Tutti i circuiti", ""));
    state.tracks.forEach((t) => select.add(new Option(t.name, t.id)));
    select.value = state.tracks.some((t) => t.id === previous) ? previous : "";
    for (let i = 0; i < 2; i++) {
      const input = el(i ? "dnTelemetryVideoB" : "dnTelemetryVideoA");
      const selected = ready
        ? viewer().videoBindings[i]?.siteVideoId
        : input.value;
      input.replaceChildren(new Option("Scegli onboard salvato…", ""));
      videoEntries()
        .filter(
          (v) =>
            !select.value || v.track.id === select.value || v.id === selected,
        )
        .forEach((v) =>
          input.add(new Option(`${v.track.name} · ${v.name}`, v.id)),
        );
      input.value = selected || "";
    }
  }
  async function connect(i, id) {
    if (!ready || !id) return;
    const revision = ++revisions[i],
      api = viewer(),
      lap = api.laps[i];
    try {
      const entry = videoEntries().find((v) => v.id === id);
      if (!entry) throw Error("Onboard non più presente nel circuito.");
      const file = await loadVideo(id);
      if (revision !== revisions[i] || api.laps[i] !== lap) return;
      if (!file)
        throw Error("Il file video non è disponibile in questo browser.");
      api.attachVideo(file, i, { siteVideoId: id, name: entry.name });
      status(
        `Onboard ${i ? "arancione" : "blu"} collegato: ${entry.name}. Apri Allineamento nel grafico.`,
      );
    } catch (error) {
      status(error.message);
    }
  }
  async function reconnect() {
    refreshVideos();
    for (let i = 0; i < 2; i++) {
      const binding = viewer().videoBindings[i];
      if (!binding) continue;
      // IDs are authoritative. Name matching is only used when unambiguous.
      const matches = videoEntries().filter(
        (v) =>
          v.name === binding.name && (!binding.size || v.size === binding.size),
      );
      const id =
        binding.siteVideoId || (matches.length === 1 ? matches[0].id : null);
      if (id) await connect(i, id);
    }
    refreshVideos();
  }
  function datasetDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("driver-notes-telemetry-v1", 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore("sets", { keyPath: "id" });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  async function store(operation, value) {
    const db = await datasetDB();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(
          "sets",
          operation === "getAll" ? "readonly" : "readwrite",
        );
        const request = tx.objectStore("sets")[operation](value);
        tx.oncomplete = () => resolve(request.result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  }
  async function library() {
    const token = ++generation;
    try {
      const items = await store("getAll");
      if (token !== generation) return;
      rows = items.sort((a, b) => b.updated - a.updated);
      const root = el("dnTelemetryLibrary");
      root.replaceChildren();
      if (!rows.length) {
        root.textContent =
          "Nessun set salvato. Salva un giro o apri un JSON/CSV nel pannello Dati del grafico.";
        return;
      }
      rows.forEach((item) => {
        const row = document.createElement("div");
        row.className = "note";
        const name = document.createElement("strong");
        name.textContent = item.data.lap.name;
        const info = document.createElement("p");
        info.className = "muted";
        info.textContent = `${item.trackName || "Circuito non indicato"} · ${item.data.lap.rows.length.toLocaleString("it-IT")} campioni · ${item.data.video?.name || "Senza onboard"}`;
        const actions = document.createElement("div");
        actions.className = "flex";
        [0, 1].forEach((i) => {
          const button = document.createElement("button");
          button.className = "light";
          button.textContent = i ? "Apri nell’arancione" : "Apri nel blu";
          button.onclick = () => {
            if (!ready) return;
            try {
              viewer().restoreComparison(item.data, {
                target: i,
                label: item.data.lap.name,
              });
              el("dnTelemetryDemo").hidden = true;
            } catch (error) {
              status(error.message);
            }
          };
          actions.append(button);
        });
        const remove = document.createElement("button");
        remove.className = "danger";
        remove.textContent = "Elimina set";
        remove.onclick = async () => {
          if (
            !confirm(
              "Eliminare questo set? Il video originale resta nel circuito.",
            )
          )
            return;
          try {
            await store("delete", item.id);
            await library();
          } catch (error) {
            status("Set non eliminato: " + error.message);
          }
        };
        actions.append(remove);
        row.append(name, info, actions);
        root.append(row);
      });
    } catch (error) {
      status("Libreria non disponibile: " + error.message);
    }
  }
  el("dnTelemetrySave").onclick = async () => {
    if (!ready) return;
    const i = Number(el("dnTelemetrySlot").value),
      name = el("dnTelemetryName").value.trim();
    if (!name) {
      status("Scrivi un nome per il set.");
      return;
    }
    try {
      const data = viewer().datasetSnapshot(i, name),
        entry = videoEntries().find((v) => v.id === data.video?.siteVideoId);
      await store("put", {
        id: uid(),
        data,
        trackId: entry?.track.id || null,
        trackName: entry?.track.name || "",
        updated: Date.now(),
      });
      status(`Set «${name}» salvato nel sito.`);
      await library();
    } catch (error) {
      status("Set non salvato: " + error.message);
    }
  };
  el("dnTelemetryTrack").onchange = refreshVideos;
  [0, 1].forEach(
    (i) =>
      (el(i ? "dnTelemetryVideoB" : "dnTelemetryVideoA").onchange = (e) =>
        connect(i, e.target.value)),
  );
  const frame = el("dnTelemetryFrame");
  frame.addEventListener("load", () => {
    if (!frame.contentWindow.monzaViewer) return;
    ready = true;
    frame.contentWindow.addEventListener("telemetrydatachange", () => {
      el("dnTelemetryDemo").hidden = true;
      reconnect();
    });
    refreshVideos();
  });
  let initialized = false;
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
      library();
      return;
    }
    // Keep the embedded comparison and loaded videos alive while navigating.
    if (ready) {
      frame.contentDocument.querySelectorAll("video").forEach((v) => v.pause());
    }
    return previousRender.apply(this, arguments);
  };
})();
