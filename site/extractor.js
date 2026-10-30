/* Local, offline OCR. Accept only labelled HUD values; never infer channels from random scene digits. */
(() => {
  const fields = [
    {
      id: "speed",
      name: "Velocità",
      label: /\b(?:speed|km\s*\/?\s*h|kmh|kph|velocit[aà])\b/i,
      max: 450,
    },
    {
      id: "rpm",
      name: "Giri motore",
      label: /\b(?:rpm|revs|engine|giri)\b/i,
      max: 22000,
    },
    { id: "gear", name: "Marcia", label: /\b(?:gear|marcia)\b/i, max: 9 },
    {
      id: "throttle",
      name: "Acceleratore",
      label: /\b(?:throttle|gas|accelerator|accel)\b/i,
      max: 100,
    },
    { id: "brake", name: "Freno", label: /\b(?:brake|freno)\b/i, max: 100 },
  ];
  let workerPromise = null,
    worker = null,
    workerURL = null;
  const decode = (id) =>
    Uint8Array.from(atob(document.getElementById(id).textContent.trim()), (c) =>
      c.charCodeAt(0),
    );
  async function getWorker() {
    if (!workerPromise)
      workerPromise = (async () => {
        const core = new TextDecoder().decode(decode("dnOCRCore"));
        const script = new TextDecoder().decode(decode("dnOCRWorker"));
        workerURL = URL.createObjectURL(
          new Blob([core, "\n", script], { type: "application/javascript" }),
        );
        worker = await timeout(
          Tesseract.createWorker(
            [{ code: "eng", data: decode("dnOCRLanguage") }],
            1,
            {
              workerPath: workerURL,
              workerBlobURL: false,
              cacheMethod: "none",
              gzip: true,
              errorHandler: () => {},
            },
          ),
          60000,
          "Il motore OCR non si è avviato. Riprova o usa un altro browser.",
        );
        await worker.setParameters({ tessedit_pageseg_mode: "11" });
        return worker;
      })().catch((error) => {
        workerPromise = null;
        throw error;
      });
    return workerPromise;
  }
  async function release() {
    const current = worker;
    worker = null;
    workerPromise = null;
    if (current) await current.terminate();
    if (workerURL) URL.revokeObjectURL(workerURL);
    workerURL = null;
  }
  function lines(data) {
    const result = [];
    for (const block of data.blocks || [])
      for (const para of block.paragraphs || [])
        for (const line of para.lines || []) result.push(line);
    return result;
  }
  function value(text, field) {
    const clean = text
      .trim()
      .replace(/(?<=\d)[,](?=\d{3}\b)/g, "")
      .replace(",", ".");
    const match = clean.match(/\d+(?:\.\d+)?/);
    if (!match) return null;
    const n = Number(match[0]);
    return Number.isFinite(n) &&
      n >= 0 &&
      n <= field.max &&
      (field.id !== "gear" || Number.isInteger(n))
      ? n
      : null;
  }
  function detect(data, width, height) {
    const found = {},
      ls = lines(data),
      all = ls.flatMap((line) => line.words || []);
    const roi = (word) => {
      const b = word.bbox,
        pad = 4;
      return {
        x: Math.max(0, b.x0 - pad) / width,
        y: Math.max(0, b.y0 - 5) / height,
        w: Math.min(width - b.x0 + pad, b.x1 - b.x0 + 2 * pad) / width,
        h: Math.min(height - b.y0 + 5, b.y1 - b.y0 + 10) / height,
      };
    };
    for (const field of fields) {
      const labelled = ls.filter((line) => field.label.test(line.text || "")),
        candidates = [];
      const valid = (word) =>
        (word.confidence ?? 0) >= 45 &&
        word.bbox &&
        value(word.text, field) !== null &&
        !(/[:/]/.test(word.text) && !field.label.test(word.text));
      for (const line of labelled) {
        const inline = (line.words || []).filter(valid);
        if (inline.length === 1) {
          candidates.push(inline[0]);
          continue;
        }
        const labels = (line.words || []).filter((word) =>
          field.label.test(word.text || ""),
        );
        for (const label of labels) {
          const b = label.bbox;
          if (!b) continue;
          const h = Math.max(8, b.y1 - b.y0),
            center = (b.x0 + b.x1) / 2;
          const near = all
            .filter((word) => {
              if (!valid(word)) return false;
              const r = word.bbox,
                dy = (r.y0 + r.y1 - b.y0 - b.y1) / 2,
                dx = Math.abs((r.x0 + r.x1) / 2 - center);
              return (
                Math.abs(dy) < h * 4 &&
                dx < Math.max(b.x1 - b.x0, width * 0.035) &&
                !(
                  field.id === "rpm" &&
                  value(word.text, field) > 0 &&
                  value(word.text, field) < 500
                )
              );
            })
            .map((word) => ({
              word,
              score:
                Math.abs((word.bbox.y0 + word.bbox.y1 - b.y0 - b.y1) / 2) +
                Math.abs((word.bbox.x0 + word.bbox.x1) / 2 - center),
            }))
            .sort((a, b) => a.score - b.score);
          if (near.length && (!near[1] || near[1].score > near[0].score * 1.4))
            candidates.push(near[0].word);
        }
      }
      const unique = [...new Set(candidates)];
      if (unique.length === 1) found[field.id] = roi(unique[0]);
    }
    // A central gear digit is accepted only between two aligned, independently labelled RPM/speed values.
    if (!found.gear && found.rpm && found.speed) {
      const a = found.rpm,
        b = found.speed,
        centerA = a.x + a.w / 2,
        centerB = b.x + b.w / 2,
        gap = b.y - (a.y + a.h);
      if (gap > 0.01 && gap < 0.25 && Math.abs(centerA - centerB) < 0.03) {
        const middle = all.filter((word) => {
          const r = word.bbox;
          if (
            !r ||
            (word.confidence ?? 0) < 60 ||
            !/^\d$/.test(word.text.trim())
          )
            return false;
          const x = (r.x0 + r.x1) / 2 / width,
            y = (r.y0 + r.y1) / 2 / height;
          return (
            y > a.y + a.h &&
            y < b.y &&
            Math.abs(x - (centerA + centerB) / 2) < Math.max(a.w, b.w) * 0.6
          );
        });
        if (middle.length === 1) found.gear = roi(middle[0]);
        else if (!middle.length)
          found.gear = {
            x: Math.max(0, (centerA + centerB) / 2 - Math.max(a.w, b.w) * 0.65),
            y: a.y + a.h + gap * 0.12,
            w: Math.max(a.w, b.w) * 1.3,
            h: gap * 0.76,
            inferred: true,
          };
      }
    }
    return found;
  }
  function preprocess(ctx, w, h, contentWidth, contentHeight) {
    const image = ctx.getImageData(0, 0, w, h),
      p = image.data;
    let sum = 0,
      count = 0;
    for (let y = 7; y < Math.min(h, 7 + contentHeight); y += 2)
      for (let x = 10; x < Math.min(w, 10 + contentWidth); x += 2) {
        const i = (y * w + x) * 4;
        sum += (p[i] + p[i + 1] + p[i + 2]) / 3;
        count++;
      }
    const dark = sum / Math.max(1, count) < 145;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4,
          inside =
            x >= 10 && x < 10 + contentWidth && y >= 7 && y < 7 + contentHeight;
        let gray = inside
          ? p[i] * 0.2126 + p[i + 1] * 0.7152 + p[i + 2] * 0.0722
          : 255;
        if (inside && dark) gray = 255 - gray;
        p[i] = p[i + 1] = p[i + 2] = gray;
        p[i + 3] = 255;
      }
    ctx.putImageData(image, 0, 0);
  }
  function timeout(promise, ms, label) {
    let timer;
    return Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(Error(label)), ms);
      }),
    ]).finally(() => clearTimeout(timer));
  }
  async function seek(video, time, signal) {
    if (signal?.aborted)
      throw new DOMException("Analisi interrotta", "AbortError");
    if (Math.abs(video.currentTime - time) < 0.0001 && video.readyState >= 2)
      return;
    await timeout(
      new Promise((resolve, reject) => {
        const done = () => {
            cleanup();
            resolve();
          },
          fail = () => {
            cleanup();
            reject(Error("Fotogramma non leggibile."));
          },
          abort = () => {
            cleanup();
            reject(new DOMException("Analisi interrotta", "AbortError"));
          };
        const cleanup = () => {
          video.removeEventListener("seeked", done);
          video.removeEventListener("error", fail);
          signal?.removeEventListener("abort", abort);
        };
        video.addEventListener("seeked", done, { once: true });
        video.addEventListener("error", fail, { once: true });
        signal?.addEventListener("abort", abort, { once: true });
        video.currentTime = time;
      }),
      15000,
      "Impossibile leggere il fotogramma.",
    );
  }
  async function estimateFPS(video, signal) {
    if (!video.requestVideoFrameCallback) return 30;
    return new Promise((resolve) => {
      let previous = null,
        callback = null,
        finished = false;
      const samples = [];
      const done = () => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        if (callback !== null) video.cancelVideoFrameCallback(callback);
        video.pause();
        signal?.removeEventListener("abort", done);
        const sorted = samples
          .filter((n) => Number.isFinite(n) && n >= 5 && n <= 240)
          .sort((a, b) => a - b);
        let fps = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 30;
        const standard = [10, 15, 24, 25, 30, 50, 60, 120].find(
          (n) => Math.abs(n - fps) / n < 0.025,
        );
        resolve(standard || fps);
      };
      const tick = (_time, meta) => {
        if (finished) return;
        if (previous && meta.mediaTime > previous.mediaTime)
          samples.push(
            (meta.presentedFrames - previous.presentedFrames) /
              (meta.mediaTime - previous.mediaTime),
          );
        previous = meta;
        if (samples.length >= 4) done();
        else callback = video.requestVideoFrameCallback(tick);
      };
      const timer = setTimeout(done, 900);
      signal?.addEventListener("abort", done, { once: true });
      callback = video.requestVideoFrameCallback(tick);
      video.play().catch(done);
    });
  }
  async function analyze(
    file,
    { onProgress = () => {}, signal, sampleRate = 30, regions = null } = {},
  ) {
    const video = document.createElement("video"),
      url = URL.createObjectURL(file);
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = url;
    const canvas = document.createElement("canvas"),
      ctx = canvas.getContext("2d", { willReadFrequently: true });
    try {
      onProgress({ phase: "Apertura onboard", progress: 0 });
      await timeout(
        new Promise((resolve, reject) => {
          video.onloadeddata = resolve;
          video.onerror = () =>
            reject(
              Error("Formato video non leggibile. Prova Safari o MP4 H.264."),
            );
          video.load();
        }),
        30000,
        "Video non leggibile.",
      );
      if (!Number.isFinite(video.duration) || video.duration <= 0)
        throw Error("Durata video non valida.");
      const fpsPromise = estimateFPS(video, signal);
      const engine = await getWorker();
      const sourceFPS = await fpsPromise;
      onProgress({ phase: "Ricerca dei valori HUD", progress: 0 });
      let rois = regions ? structuredClone(regions) : {},
        detectedTimes = [];
      const width = Math.min(1920, video.videoWidth),
        height = Math.round((video.videoHeight * width) / video.videoWidth);
      canvas.width = width;
      canvas.height = height;
      if (!Object.keys(rois).length)
        for (const t of [
          ...new Set([
            0,
            Math.min(video.duration * 0.15, 2),
            Math.min(video.duration * 0.5, 8),
          ]),
        ]) {
          await seek(video, t, signal);
          const windows = [
            { x: 0, y: 0, w: 1, h: 1 },
            { x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
            { x: 0, y: 0.5, w: 0.5, h: 0.5 },
          ];
          for (const window of windows) {
            if (signal?.aborted)
              throw new DOMException("Analisi interrotta", "AbortError");
            canvas.width =
              window.w === 1
                ? width
                : Math.min(1600, Math.round(video.videoWidth * window.w * 2));
            canvas.height = Math.round(
              (video.videoHeight * window.h * canvas.width) /
                (video.videoWidth * window.w),
            );
            ctx.drawImage(
              video,
              window.x * video.videoWidth,
              window.y * video.videoHeight,
              window.w * video.videoWidth,
              window.h * video.videoHeight,
              0,
              0,
              canvas.width,
              canvas.height,
            );
            const { data } = await engine.recognize(
              canvas,
              {},
              { text: true, blocks: true },
            );
            const found = detect(data, canvas.width, canvas.height);
            for (const [key, r] of Object.entries(found)) {
              rois[key] = {
                ...r,
                x: window.x + r.x * window.w,
                y: window.y + r.y * window.h,
                w: r.w * window.w,
                h: r.h * window.h,
              };
              detectedTimes.push(t);
            }
            if (rois.speed && rois.rpm && rois.gear) break;
          }
          if (Object.keys(rois).length >= 3) break;
        }
      if (!Object.keys(rois).length)
        return {
          lap: null,
          missing: fields.map((f) => f.name),
          coverage: {},
          regions: {},
          reason:
            "Nessun valore HUD riconoscibile. Velocità, giri, marcia e pedali non trovati: apri «Regola lettura» per indicare le aree numeriche, se presenti nel video.",
        };
      const active = fields.filter((f) => rois[f.id]),
        rows = [],
        counts = Object.fromEntries(fields.map((f) => [f.id, 0]));
      const crop = document.createElement("canvas"),
        cx = crop.getContext("2d", { willReadFrequently: true });
      crop.width = 420;
      crop.height = 80;
      canvas.width = 460;
      canvas.height = active.length * 100;
      await engine.setParameters({
        tessedit_char_whitelist: "0123456789.,",
        tessedit_pageseg_mode: "6",
      });
      const total = Math.max(2, Math.ceil(video.duration * sampleRate));
      for (let frame = 0; frame < total; frame++) {
        if (signal?.aborted)
          throw new DOMException("Analisi interrotta", "AbortError");
        const t = Math.min(
          frame / sampleRate,
          Math.max(0, video.duration - 0.001),
        );
        await seek(video, t, signal);
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        active.forEach((field, index) => {
          const r = rois[field.id];
          cx.fillStyle = "white";
          cx.fillRect(0, 0, 420, 80);
          const sw = r.w * video.videoWidth,
            sh = r.h * video.videoHeight,
            scale = Math.min(400 / sw, 65 / sh);
          cx.drawImage(
            video,
            r.x * video.videoWidth,
            r.y * video.videoHeight,
            sw,
            sh,
            10,
            7,
            sw * scale,
            sh * scale,
          );
          preprocess(cx, 420, 80, sw * scale, sh * scale);
          ctx.drawImage(crop, 20, index * 100 + 10);
        });
        const { data } = await engine.recognize(
          canvas,
          {},
          { text: true, blocks: true },
        );
        const values = Object.fromEntries(fields.map((f) => [f.id, null]));
        for (const field of active) {
          const index = active.indexOf(field),
            words = lines(data)
              .flatMap((l) => l.words || [])
              .filter(
                (w) =>
                  w.bbox &&
                  Math.floor((w.bbox.y0 + w.bbox.y1) / 2 / 100) === index,
              );
          const text = words
            .map((w) => w.text)
            .join("")
            .trim();
          // Reject multiple numeric groups, low confidence and out-of-range readings.
          if (
            !words.length ||
            words.some(
              (w) => (w.confidence ?? 0) < (rois[field.id].inferred ? 70 : 45),
            ) ||
            !/^[\d.,]+$/.test(text)
          )
            continue;
          const n = value(text, field);
          if (n !== null) {
            values[field.id] = n;
            counts[field.id]++;
          }
        }
        rows.push([frame, t, t, ...fields.map((f) => values[f.id])]);
        onProgress({
          phase: "Lettura dei fotogrammi",
          progress: (frame + 1) / total,
          time: t,
          total: video.duration,
          counts: { ...counts },
        });
        if (frame % 10 === 0)
          await new Promise((resolve) => setTimeout(resolve, 0));
      }
      const missing = fields
        .filter((f) => counts[f.id] === 0)
        .map((f) => f.name);
      return {
        lap:
          counts && Object.values(counts).some(Boolean)
            ? {
                name: file.name || "Onboard",
                duration: video.duration,
                sourceStart: 0,
                sampleRate,
                sourceFPS,
                fpsEstimated: true,
                rows,
              }
            : null,
        missing,
        coverage: Object.fromEntries(
          fields.map((f) => [f.id, counts[f.id] / rows.length]),
        ),
        regions: rois,
        reason: missing.length ? "Canali non letti: " + missing.join(", ") : "",
      };
    } finally {
      video.pause();
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
      if (worker)
        await worker.setParameters({
          tessedit_char_whitelist: "",
          tessedit_pageseg_mode: "11",
        });
    }
  }
  window.DriverOCR = {
    analyze,
    detect,
    value,
    fields,
    getWorker,
    release,
    version: 1,
  };
})();
