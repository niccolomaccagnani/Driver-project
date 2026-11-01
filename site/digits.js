/* Isolate a numerical line from dial edges, separators and fragments of nearby labels. */
(() => {
  function prepare(canvas) {
    const ctx = canvas.getContext("2d", { willReadFrequently: true }),
      w = canvas.width,
      h = canvas.height,
      image = ctx.getImageData(0, 0, w, h),
      p = image.data,
      mask = new Uint8Array(w * h),
      components = [];
    for (let i = 0; i < mask.length; i++) mask[i] = p[i * 4] < 145 ? 1 : 0;
    const stack = new Int32Array(w * h);
    for (let k = 0; k < mask.length; k++) {
      if (!mask[k]) continue;
      let n = 0;
      stack[n++] = k;
      mask[k] = 0;
      const points = [];
      let x0 = w,
        y0 = h,
        x1 = 0,
        y1 = 0;
      while (n) {
        const pos = stack[--n],
          x = pos % w,
          y = (pos / w) | 0;
        points.push(pos);
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const a = x + dx,
              b = y + dy,
              j = b * w + a;
            if (a >= 0 && a < w && b >= 0 && b < h && mask[j]) {
              mask[j] = 0;
              stack[n++] = j;
            }
          }
      }
      components.push({
        x0,
        y0,
        x1,
        y1,
        w: x1 - x0 + 1,
        h: y1 - y0 + 1,
        points,
      });
    }
    const central = components.filter(
      (c) =>
        c.h >= 12 && c.w > 2 && c.w < c.h * 2.5 && c.x0 > 5 && c.x1 < w - 5,
    );
    if (!central.length) return { count: null };
    // The digit height dominates; very wide horizontal separators never define the line.
    const main = central.sort((a, b) => b.h - a.h)[0],
      kept = components.filter(
        (c) =>
          c.h >= main.h * 0.55 &&
          c.h <= main.h * 1.3 &&
          c.w < c.h * 2.5 &&
          Math.abs((c.y0 + c.y1 - main.y0 - main.y1) / 2) < main.h * 0.3,
      );
    if (!kept.length) return { count: null };
    const x0 = Math.min(...kept.map((c) => c.x0)),
      x1 = Math.max(...kept.map((c) => c.x1)),
      y0 = Math.min(...kept.map((c) => c.y0)),
      y1 = Math.max(...kept.map((c) => c.y1));
    // Keep decimal punctuation on the digit baseline, but discard fragments below it.
    const small = components.filter(
      (c) =>
        !kept.includes(c) &&
        c.w <= main.h * 0.22 &&
        c.h <= main.h * 0.25 &&
        c.x0 > x0 &&
        c.x1 < x1 &&
        c.y1 <= y1 + 2 &&
        c.y0 > y1 - main.h * 0.3,
    );
    const selected = [...kept, ...small],
      clean = document.createElement("canvas");
    clean.width = x1 - x0 + 1;
    clean.height = y1 - y0 + 1;
    const out = clean
      .getContext("2d")
      .createImageData(clean.width, clean.height);
    out.data.fill(255);
    for (const c of selected)
      for (const pos of c.points) {
        const x = (pos % w) - x0,
          y = ((pos / w) | 0) - y0;
        if (x < 0 || y < 0 || x >= clean.width || y >= clean.height) continue;
        const j = (y * clean.width + x) * 4;
        out.data[j] = p[pos * 4];
        out.data[j + 1] = p[pos * 4 + 1];
        out.data[j + 2] = p[pos * 4 + 2];
      }
    clean.getContext("2d").putImageData(out, 0, 0);
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, w, h);
    const scale = Math.min((w - 40) / clean.width, 52 / clean.height);
    ctx.drawImage(
      clean,
      20,
      12,
      Math.round(clean.width * scale),
      Math.round(clean.height * scale),
    );
    const intervals = kept.sort((a, b) => a.x0 - b.x0),
      groups = [];
    for (const c of intervals) {
      const last = groups.at(-1);
      if (last && c.x0 <= last + 1)
        groups[groups.length - 1] = Math.max(last, c.x1);
      else groups.push(c.x1);
    }
    return { count: groups.length, decimal: small.length > 0 };
  }
  window.DriverDigits = { prepare };
})();
