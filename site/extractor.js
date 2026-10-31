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
      label: /\b(?:throttle|gas|accelerator|accel|acceleratore|thr|tps)\b/i,
      max: 100,
    },
    {
      id: "brake",
      name: "Freno",
      label: /\b(?:brake|freno|brk|bps)\b/i,
      max: 100,
    },
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
    let clean = String(text).trim().toUpperCase(),
      factor = 1;
    if (field.id === "speed")
      clean = clean.replace(/\s*(?:KM\s*\/?\s*H|KMH|KPH|KM\/?|K)$/, "");
    else if (field.id === "rpm") {
      clean = clean.replace(/\s*RPM$/, "");
      if (/K$/.test(clean)) {
        factor = 1000;
        clean = clean.slice(0, -1);
      } else if (/^\d{1,2}[., ]\d{3}$/.test(clean))
        clean = clean.replace(/[., ]/, "");
    } else if (field.id === "throttle" || field.id === "brake")
      clean = clean.replace(/\s*%$/, "");
    clean = clean.trim();
    if (!/^\d+(?:[.,]\d+)?$/.test(clean)) return null;
    const n = Number(clean.replace(",", ".")) * factor;
    return Number.isFinite(n) &&
      n >= 0 &&
      n <= field.max &&
      (field.id !== "gear" || Number.isInteger(n))
      ? n
      : null;
  }
  function clipRegion(region) {
    const x = Math.max(0, Math.min(1, region.x)),
      y = Math.max(0, Math.min(1, region.y));
    return {
      ...region,
      x,
      y,
      w: Math.max(0, Math.min(1 - x, region.w)),
      h: Math.max(0, Math.min(1 - y, region.h)),
    };
  }
  function numericConfidence(word) {
    const base = word.confidence ?? 0;
    if (!/^[0-9O.,]+$/.test(word.text.trim()) || !word.symbols?.length)
      return base;
    // Dictionary word scores penalize numeric strings; require every individual glyph to be clear.
    const glyphs = word.symbols.filter((s) => s.text.trim());
    return glyphs.length
      ? Math.max(base, Math.min(...glyphs.map((s) => s.confidence ?? 0)))
      : base;
  }
  function readWords(words, field, threshold = 60, scale = 1) {
    if (!words.length) return null;
    const sorted = [...words].sort((a, b) => a.bbox.x0 - b.bbox.x0);
    if (sorted.some((w) => numericConfidence(w) < threshold)) return null;
    for (let i = 1; i < sorted.length; i++) {
      const a = sorted[i - 1],
        b = sorted[i],
        height = Math.min(a.bbox.y1 - a.bbox.y0, b.bbox.y1 - b.bbox.y0);
      const overlap =
        Math.min(a.bbox.y1, b.bbox.y1) - Math.max(a.bbox.y0, b.bbox.y0);
      const glyph = Math.max(
        (a.bbox.x1 - a.bbox.x0) / Math.max(1, a.text.trim().length),
        (b.bbox.x1 - b.bbox.x0) / Math.max(1, b.text.trim().length),
      );
      if (
        overlap < height * 0.4 ||
        b.bbox.x0 - a.bbox.x1 > Math.max(5, glyph * 1.1)
      )
        return null;
    }
    const text = sorted.map((w) => w.text).join("");
    let n = value(text, field);
    // A numeric crop can confuse round zero glyphs with O; do not repair arbitrary text.
    if (n === null && /^[0-9O.,]+$/.test(text))
      n = value(text.replace(/O/g, "0"), field);
    if (n !== null && scale !== 1 && !/K\s*(?:RPM)?$/i.test(text)) n *= scale;
    return n !== null && n <= field.max ? n : null;
  }
  function mergeRegions(samples) {
    const result = {};
    for (const field of fields) {
      let items = samples.filter((s) => s.id === field.id);
      const bars = items.filter((s) => s.region.kind === "bar"),
        numeric = items.filter((s) => s.region.kind !== "bar");
      if (bars.length && new Set(numeric.map((s) => s.time)).size < 2) {
        const outlines = bars.filter((s) => s.region.track === "outlined"),
          candidates = outlines.length ? outlines : bars,
          groups = [];
        for (const sample of candidates) {
          const r = sample.region;
          let group = groups.find((g) => {
            const a = g[0].region;
            return (
              a.axis === r.axis &&
              Math.abs(a.x - r.x) < Math.max(0.004, a.w * 0.04) &&
              Math.abs(a.y - r.y) < Math.max(0.004, a.h * 0.04) &&
              Math.abs(a.w - r.w) < Math.max(0.004, a.w * 0.04) &&
              Math.abs(a.h - r.h) < Math.max(0.004, a.h * 0.04)
            );
          });
          if (!group) {
            group = [];
            groups.push(group);
          }
          group.push(sample);
        }
        groups.sort(
          (a, b) =>
            new Set(b.map((s) => s.time)).size -
            new Set(a.map((s) => s.time)).size,
        );
        const chosen = groups[0];
        if (!chosen) continue;
        const support = new Set(chosen.map((s) => s.time)).size;
        if (groups[1] && new Set(groups[1].map((s) => s.time)).size === support)
          continue;
        const model = DriverBars.calibrate(chosen.map((s) => s.region));
        if (model) result[field.id] = { ...model, support };
        continue;
      }
      items = numeric;
      const groups = [];
      for (const sample of items) {
        const r = sample.region;
        let group = groups.find((g) => {
          const a = g[0].region;
          return (
            a.kind === r.kind &&
            Math.abs(a.x + a.w / 2 - r.x - r.w / 2) <
              Math.max(a.w, r.w) * 0.7 &&
            Math.abs(a.y + a.h / 2 - r.y - r.h / 2) < Math.max(a.h, r.h) * 0.75
          );
        });
        if (!group) {
          group = [];
          groups.push(group);
        }
        group.push(sample);
      }
      groups.sort(
        (a, b) =>
          new Set(b.map((s) => s.time)).size -
            new Set(a.map((s) => s.time)).size || b.length - a.length,
      );
      if (!groups.length) continue;
      const chosen = groups[0],
        support = new Set(chosen.map((s) => s.time)).size;
      if (
        support < 2 ||
        (groups[1] && new Set(groups[1].map((s) => s.time)).size === support)
      )
        continue;
      if (chosen[0].region.kind === "bar") {
        const model = DriverBars.calibrate(chosen.map((s) => s.region));
        if (model) result[field.id] = { ...model, support };
        continue;
      }
      const regions = chosen.map((s) => s.region),
        x = Math.min(...regions.map((r) => r.x)),
        y = Math.min(...regions.map((r) => r.y));
      const alternatives = [];
      for (const r of regions.map((r) => r.tight || r))
        if (
          !alternatives.some(
            (a) => Math.abs(a.x - r.x) < 0.002 && Math.abs(a.w - r.w) < 0.002,
          )
        )
          alternatives.push(clipRegion(r));
      result[field.id] = clipRegion({
        ...regions[0],
        x,
        y,
        w: Math.max(...regions.map((r) => r.x + r.w)) - x,
        h: Math.max(...regions.map((r) => r.y + r.h)) - y,
        alternatives: alternatives.slice(0, 4),
        support,
      });
    }
    return result;
  }
  function detect(data, width, height, image = null) {
    const found = {},
      ls = lines(data),
      all = ls.flatMap((line) => line.words || []);
    const roi = (word, field, labelWords = []) => {
      const b = word.bbox,
        pad = 4,
        tight = clipRegion({
          x: (b.x0 - pad) / width,
          y: (b.y0 - 5) / height,
          w: (b.x1 - b.x0 + 2 * pad) / width,
          h: (b.y1 - b.y0 + 10) / height,
        });
      const numeric = word.text.match(/\d+(?:[.,]\d+)?/)?.[0] || "",
        digits = numeric.replace(/[.,]/g, "").length;
      const capacity = field.id === "rpm" ? 5 : field.id === "gear" ? 1 : 3;
      const extra =
        (Math.max(0, capacity - digits) * (b.x1 - b.x0)) /
        Math.max(1, numeric.length);
      const nearby = labelWords
        .filter(
          (w) =>
            w.bbox &&
            Math.min(w.bbox.y1, b.y1) - Math.max(w.bbox.y0, b.y0) >
              (b.y1 - b.y0) * 0.4,
        )
        .sort(
          (a, c) =>
            Math.min(Math.abs(a.bbox.x1 - b.x0), Math.abs(a.bbox.x0 - b.x1)) -
            Math.min(Math.abs(c.bbox.x1 - b.x0), Math.abs(c.bbox.x0 - b.x1)),
        );
      const alignment =
        nearby[0]?.bbox.x1 <= b.x0
          ? "left"
          : nearby[0]?.bbox.x0 >= b.x1
            ? "right"
            : "center";
      const left =
        alignment === "left" ? 0 : alignment === "right" ? extra : extra / 2;
      const region = clipRegion({
        ...tight,
        x: tight.x - left / width,
        w: tight.w + extra / width,
        tight,
        scale: field.id === "rpm" && /K$/i.test(word.text) ? 1000 : 1,
      });
      // Keep a neighbouring unit complete; cutting a percent sign can look like an extra digit.
      const unitPattern =
        field.id === "speed"
          ? /^(?:KM\/?H|KPH)$/i
          : field.id === "rpm"
            ? /^RPM$/i
            : /^%$/;
      const suffix = all.find(
        (w) =>
          w !== word &&
          w.bbox &&
          unitPattern.test(w.text.trim()) &&
          w.bbox.x0 >= b.x1 - 2 &&
          w.bbox.x0 - b.x1 <
            Math.max(10, ((b.x1 - b.x0) / Math.max(1, digits)) * 1.6) &&
          Math.min(w.bbox.y1, b.y1) - Math.max(w.bbox.y0, b.y0) >
            (b.y1 - b.y0) * 0.4,
      );
      if (suffix)
        region.w = Math.min(
          1 - region.x,
          Math.max(region.w, (suffix.bbox.x1 + pad + extra) / width - region.x),
        );
      return region;
    };
    for (const field of fields) {
      const labelled = ls.filter((line) => field.label.test(line.text || "")),
        candidates = [];
      const valid = (word) =>
        numericConfidence(word) >= 45 &&
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
      if (unique.length === 1)
        found[field.id] = roi(
          unique[0],
          field,
          all.filter((w) => field.label.test(w.text || "")),
        );
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
        if (middle.length === 1)
          found.gear = roi(
            middle[0],
            fields.find((f) => f.id === "gear"),
          );
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
    if (image) {
      const labels = [];
      for (const field of fields.filter(
        (f) => (f.id === "throttle" || f.id === "brake") && !found[f.id],
      ))
        for (const word of all)
          if (word.bbox && field.label.test(word.text || ""))
            labels.push({ id: field.id, bbox: word.bbox });
      if (labels.length) {
        const bars = DriverBars.detect(image, labels);
        for (const id of ["throttle", "brake"])
          if (!found[id] && bars[id]) found[id] = bars[id];
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
        let landed = false,
          decoded = false,
          callback = null,
          settle = null;
        const target = Math.min(video.duration - 0.000001, time + 0.00001),
          interval = 1 / (video._driverFrameRate || 30);
        const cleanup = () => {
          video.removeEventListener("seeked", onSeeked);
          video.removeEventListener("error", fail);
          signal?.removeEventListener("abort", abort);
          clearTimeout(settle);
          if (callback !== null) video.cancelVideoFrameCallback?.(callback);
        };
        const finish = () => {
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
        const frame = (_now, meta) => {
          if (
            meta.mediaTime >= target - interval + 0.000001 &&
            meta.mediaTime <= target + interval * 0.2
          ) {
            decoded = true;
            if (landed) finish();
          } else callback = video.requestVideoFrameCallback(frame);
        };
        const onSeeked = () => {
          landed = true;
          if (decoded) finish();
          else settle = setTimeout(finish, 60);
        };
        video.addEventListener("seeked", onSeeked, { once: true });
        video.addEventListener("error", fail, { once: true });
        signal?.addEventListener("abort", abort, { once: true });
        if (video.requestVideoFrameCallback)
          callback = video.requestVideoFrameCallback(frame);
        video.currentTime = target;
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
      const engine = await getWorker();
      const sourceFPS = await estimateFPS(video, signal);
      video._driverFrameRate = sourceFPS;
      onProgress({ phase: "Ricerca dei valori HUD", progress: 0 });
      let rois = regions ? structuredClone(regions) : {},
        roiSamples = [];
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
            const raw = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const found = detect(data, canvas.width, canvas.height, raw);
            if (!found.throttle || !found.brake) {
              const contrast = document.createElement("canvas");
              contrast.width = canvas.width;
              contrast.height = canvas.height;
              const pixels = new ImageData(
                new Uint8ClampedArray(raw.data),
                raw.width,
                raw.height,
              );
              for (let i = 0; i < pixels.data.length; i += 4) {
                const r = pixels.data[i],
                  g = pixels.data[i + 1],
                  b = pixels.data[i + 2],
                  white =
                    Math.min(r, g, b) >= 150 &&
                    Math.max(r, g, b) - Math.min(r, g, b) < 85;
                pixels.data[i] =
                  pixels.data[i + 1] =
                  pixels.data[i + 2] =
                    white ? 0 : 255;
                pixels.data[i + 3] = 255;
              }
              contrast.getContext("2d").putImageData(pixels, 0, 0);
              const labels = await engine.recognize(
                  contrast,
                  {},
                  { text: true, blocks: true },
                ),
                extra = detect(labels.data, canvas.width, canvas.height, raw);
              for (const id of ["throttle", "brake"])
                if (!found[id] && extra[id]) found[id] = extra[id];
            }
            for (const [key, r] of Object.entries(found)) {
              rois[key] = {
                ...r,
                x: window.x + r.x * window.w,
                y: window.y + r.y * window.h,
                w: r.w * window.w,
                h: r.h * window.h,
                tight: r.tight
                  ? {
                      x: window.x + r.tight.x * window.w,
                      y: window.y + r.tight.y * window.h,
                      w: r.tight.w * window.w,
                      h: r.tight.h * window.h,
                    }
                  : undefined,
              };
              roiSamples.push({ id: key, time: t, region: rois[key] });
            }
            if (Object.keys(found).length === 5) break;
          }
        }
      if (!regions || !Object.keys(regions).length)
        rois = mergeRegions(roiSamples);
      const manualBars = Object.entries(rois).filter(
        ([, r]) => r.kind === "bar",
      );
      if (manualBars.length) {
        const samples = Object.fromEntries(manualBars.map(([id]) => [id, []]));
        canvas.width = width;
        canvas.height = height;
        for (const t of [
          ...new Set([
            0,
            Math.min(video.duration * 0.15, 2),
            Math.min(video.duration * 0.5, 8),
          ]),
        ]) {
          await seek(video, t, signal);
          ctx.drawImage(video, 0, 0, width, height);
          const image = ctx.getImageData(0, 0, width, height);
          for (const [id, r] of manualBars)
            samples[id].push(
              DriverBars.sample(image, {
                ...r,
                manual: !!r.manual,
                track: r.track || "manual",
              }),
            );
        }
        for (const [id] of manualBars) {
          const model = DriverBars.calibrate(samples[id]);
          if (model) rois[id] = model;
          else delete rois[id];
        }
      }
      for (const [id, r] of Object.entries(rois).filter(
        ([, r]) => r.kind === "bar" && !r.boundsProven,
      )) {
        const companion = Object.entries(rois).find(
          ([other, a]) =>
            other !== id &&
            a.kind === "bar" &&
            a.boundsProven &&
            a.axis === r.axis &&
            (r.axis === "horizontal"
              ? Math.abs(a.x - r.x) < Math.max(0.005, r.w * 0.04) &&
                Math.abs(a.w - r.w) < r.w * 0.04
              : Math.abs(a.y - r.y) < Math.max(0.005, r.h * 0.04) &&
                Math.abs(a.h - r.h) < r.h * 0.04),
        );
        if (companion) {
          r.boundsProven = true;
          r.boundsFrom = companion[0];
        } else delete rois[id];
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
      const active = fields.filter(
          (f) => rois[f.id] && rois[f.id].kind !== "bar",
        ),
        barFields = fields.filter((f) => rois[f.id]?.kind === "bar"),
        rows = [],
        counts = Object.fromEntries(fields.map((f) => [f.id, 0])),
        retries = Object.fromEntries(fields.map((f) => [f.id, 0]));
      const crop = document.createElement("canvas"),
        cx = crop.getContext("2d", { willReadFrequently: true });
      crop.width = 420;
      crop.height = 80;
      canvas.width = 460;
      canvas.height = Math.max(1, active.length * 100);
      const barCanvas = document.createElement("canvas"),
        barContext = barCanvas.getContext("2d", { willReadFrequently: true });
      await engine.setParameters({
        tessedit_char_whitelist: "",
        tessedit_pageseg_mode: "6",
      });
      function drawCrop(region) {
        const r = clipRegion(region),
          sw = r.w * video.videoWidth,
          sh = r.h * video.videoHeight,
          scale = Math.min(400 / sw, 65 / sh),
          targetWidth = Math.max(1, Math.floor(sw * scale)),
          targetHeight = Math.max(1, Math.floor(sh * scale));
        cx.fillStyle = "white";
        cx.fillRect(0, 0, 420, 80);
        cx.drawImage(
          video,
          r.x * video.videoWidth,
          r.y * video.videoHeight,
          sw,
          sh,
          10,
          7,
          targetWidth,
          targetHeight,
        );
        preprocess(cx, 420, 80, targetWidth, targetHeight);
      }
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
          drawCrop(rois[field.id]);
          ctx.drawImage(crop, 20, index * 100 + 10);
        });
        const { data } = active.length
          ? await engine.recognize(canvas, {}, { text: true, blocks: true })
          : { data: { blocks: [] } };
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
          const scale = rois[field.id].scale || 1;
          let n = readWords(
            words,
            field,
            rois[field.id].inferred ? 70 : 60,
            scale,
          );
          if (n === null) {
            retries[field.id]++;
            const votes = [];
            const initial = readWords(words, field, 45, scale);
            if (initial !== null) votes.push(initial);
            // Isolated line reads retain the full field width: a narrow retry must not truncate a digit.
            drawCrop(rois[field.id]);
            for (const mode of ["7", "13"]) {
              await engine.setParameters({
                tessedit_pageseg_mode: mode,
                tessedit_char_whitelist:
                  mode === "13"
                    ? "0123456789.," +
                      (field.id === "speed"
                        ? "KMHkmh/Pp"
                        : field.id === "rpm"
                          ? "RPMrpmKk"
                          : field.id === "gear"
                            ? ""
                            : "%")
                    : "",
              });
              const retry = await engine.recognize(
                  crop,
                  {},
                  { text: true, blocks: true },
                ),
                retryWords = lines(retry.data).flatMap(
                  (line) => line.words || [],
                );
              n = readWords(
                retryWords,
                field,
                rois[field.id].inferred ? 70 : 65,
                scale,
              );
              if (n !== null) break;
              const candidate = readWords(retryWords, field, 45, scale);
              if (candidate !== null) {
                if (votes.includes(candidate)) {
                  n = candidate;
                  break;
                }
                votes.push(candidate);
              }
            }
            await engine.setParameters({
              tessedit_pageseg_mode: "6",
              tessedit_char_whitelist: "",
            });
          }
          if (n !== null && n <= field.max) {
            values[field.id] = n;
            counts[field.id]++;
          }
        }

        for (const field of barFields) {
          const model = rois[field.id],
            sw = model.w * video.videoWidth,
            sh = model.h * video.videoHeight;
          barCanvas.width = Math.max(2, Math.round(sw));
          barCanvas.height = Math.max(2, Math.round(sh));
          barContext.drawImage(
            video,
            model.x * video.videoWidth,
            model.y * video.videoHeight,
            sw,
            sh,
            0,
            0,
            barCanvas.width,
            barCanvas.height,
          );
          const reading = DriverBars.read(
            barContext.getImageData(0, 0, barCanvas.width, barCanvas.height),
            model,
          );
          if (reading !== null) {
            values[field.id] = reading;
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
      const quality = {
        engineVersion: 3,
        calibrationTimes: [...new Set(roiSamples.map((s) => s.time))],
        regions: structuredClone(rois),
        channels: Object.fromEntries(
          fields.map((f) => [
            f.id,
            {
              accepted: counts[f.id],
              method:
                rois[f.id]?.kind === "bar"
                  ? "bar-percentage"
                  : rois[f.id]
                    ? "ocr"
                    : "missing",
              missing: rows.length - counts[f.id],
              retried: retries[f.id],
            },
          ]),
        ),
      };
      return {
        quality,
        lap:
          counts && Object.values(counts).some(Boolean)
            ? {
                name: file.name || "Onboard",
                duration: video.duration,
                sourceStart: 0,
                sampleRate,
                sourceFPS,
                fpsEstimated: true,
                extraction: quality,
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
    version: 3,
    readWords,
    mergeRegions,
  };
})();
