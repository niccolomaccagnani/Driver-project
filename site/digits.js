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
  function describe(mask, width = 420, height = 80) {
    if (!mask) return [];
    const runs = [];
    let start = -1;
    for (let x = 0; x <= width; x++) {
      let ink = 0;
      for (let y = 0; y < height && x < width; y++) ink += mask[y * width + x];
      if (ink && start < 0) start = x;
      if (!ink && start >= 0) {
        if (x - start >= 2) runs.push([start, x]);
        start = -1;
      }
    }
    return runs.flatMap(([x0, x1]) => {
      let y0 = height,
        y1 = -1;
      for (let y = 0; y < height; y++)
        for (let x = x0; x < x1; x++)
          if (mask[y * width + x]) {
            y0 = Math.min(y0, y);
            y1 = Math.max(y1, y);
          }
      if (y1 - y0 < 12) return [];
      const c = document.createElement("canvas");
      c.width = x1 - x0;
      c.height = y1 - y0 + 1;
      const ctx = c.getContext("2d"),
        im = ctx.createImageData(c.width, c.height);
      for (let y = 0; y < c.height; y++)
        for (let x = 0; x < c.width; x++) {
          const i = (y * c.width + x) * 4,
            v = mask[(y + y0) * width + x + x0] ? 0 : 255;
          im.data[i] = im.data[i + 1] = im.data[i + 2] = v;
          im.data[i + 3] = 255;
        }
      ctx.putImageData(im, 0, 0);
      const small = document.createElement("canvas");
      small.width = 24;
      small.height = 32;
      small.getContext("2d").drawImage(c, 0, 0, 24, 32);
      const rgba = small.getContext("2d").getImageData(0, 0, 24, 32).data;
      return [
        {
          aspect: c.width / c.height,
          pixels: Float32Array.from(
            { length: 24 * 32 },
            (_, i) => 1 - rgba[i * 4] / 255,
          ),
        },
      ];
    });
  }
  function createBank() {
    const examples = Array.from({ length: 10 }, () => []),
      support = new Uint32Array(10);
    function distance(a, b) {
      let total = 0;
      for (let i = 0; i < a.pixels.length; i++)
        total += Math.abs(a.pixels[i] - b.pixels[i]);
      return total / a.pixels.length + Math.abs(a.aspect - b.aspect) * 0.1;
    }
    return {
      learn(glyphs, text) {
        if (!/^\d+$/.test(text) || glyphs.length !== text.length) return;
        glyphs.forEach((g, i) => {
          const digit = Number(text[i]),
            bank = examples[digit];
          support[digit]++;
          if (bank.length < 12 && !bank.some((b) => distance(g, b) < 0.006))
            bank.push(g);
        });
      },
      read(glyphs) {
        if (!glyphs.length) return null;
        let text = "",
          worst = 0,
          margin = 1;
        for (const g of glyphs) {
          const ranked = examples
            .map((bank, digit) => ({
              digit,
              score:
                support[digit] >= 2 && bank.length
                  ? Math.min(...bank.map((b) => distance(g, b)))
                  : Infinity,
            }))
            .sort((a, b) => a.score - b.score);
          if (
            !Number.isFinite(ranked[1].score) ||
            ranked[0].score > 0.1 ||
            ranked[1].score - ranked[0].score < 0.035
          )
            return null;
          text += ranked[0].digit;
          worst = Math.max(worst, ranked[0].score);
          margin = Math.min(margin, ranked[1].score - ranked[0].score);
        }
        return { value: Number(text), distance: worst, margin };
      },
      support: () => Array.from(support),
    };
  }
  window.DriverDigits = { prepare, describe, createBank };
})();
