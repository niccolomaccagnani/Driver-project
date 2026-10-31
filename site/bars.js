/* Geometry-based pedal bars. The denominator is the complete visible track, never the largest observed fill. */
(() => {
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const pixel = (image, x, y) => {
    const i =
      (clamp(Math.floor(y), 0, image.height - 1) * image.width +
        clamp(Math.floor(x), 0, image.width - 1)) *
      4;
    return [image.data[i], image.data[i + 1], image.data[i + 2]];
  };
  const chromatic = (rgb) => {
    const hi = Math.max(...rgb),
      lo = Math.min(...rgb);
    return hi >= 20 && hi - lo >= 18 && (hi - lo) / Math.max(1, hi) > 0.32;
  };
  function trackColor(rgb, family) {
    const hi = Math.max(...rgb),
      lo = Math.min(...rgb),
      delta = hi - lo;
    if (hi < 8 || delta < 6 || delta / Math.max(1, hi) < 0.25) return false;
    if (!family) return true;
    let hue =
      hi === rgb[0]
        ? (rgb[1] - rgb[2]) / delta
        : hi === rgb[1]
          ? 2 + (rgb[2] - rgb[0]) / delta
          : 4 + (rgb[0] - rgb[1]) / delta;
    hue = (hue * 60 + 360) % 360;
    const actual = 1 + (Math.round(hue / 20) % 18),
      d = Math.abs(actual - family);
    return Math.min(d, 18 - d) <= 2;
  }
  const borderPixel = (rgb) =>
    Math.max(...rgb) - Math.min(...rgb) <
      Math.max(45, Math.max(...rgb) * 0.6) && Math.max(...rgb) >= 110;
  function nearby(box, label) {
    const dx = Math.max(box.x - label.x1, label.x0 - box.x - box.w, 0),
      dy = Math.max(box.y - label.y1, label.y0 - box.y - box.h, 0),
      h = Math.max(8, label.y1 - label.y0);
    return Math.hypot(dx, dy) / h;
  }
  function colored(image, label) {
    const lh = Math.max(8, label.y1 - label.y0),
      radius = Math.max(100, lh * 4),
      x0 = Math.max(
        0,
        Math.floor(label.x0 - Math.max(radius, image.width * 0.6)),
      ),
      y0 = Math.max(0, Math.floor(label.y0 - radius)),
      x1 = Math.min(image.width, Math.ceil(label.x1 + image.width * 0.9)),
      y1 = Math.min(image.height, Math.ceil(label.y1 + image.height * 0.65)),
      w = x1 - x0,
      h = y1 - y0;
    const mask = new Uint8Array(w * h),
      stack = new Int32Array(w * h),
      found = [];
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = ((y + y0) * image.width + x + x0) * 4,
          hi = Math.max(image.data[i], image.data[i + 1], image.data[i + 2]),
          lo = Math.min(image.data[i], image.data[i + 1], image.data[i + 2]);
        const r = image.data[i],
          g = image.data[i + 1],
          b = image.data[i + 2],
          delta = hi - lo;
        let hue =
          hi === r
            ? (g - b) / Math.max(1, delta)
            : hi === g
              ? 2 + (b - r) / Math.max(1, delta)
              : 4 + (r - g) / Math.max(1, delta);
        hue = (hue * 60 + 360) % 360;
        mask[y * w + x] =
          hi >= 20 && delta >= 18 && delta / Math.max(1, hi) > 0.32
            ? 1 + (Math.round(hue / 20) % 18)
            : 0;
      }
    for (let start = 0; start < mask.length; start++) {
      if (!mask[start]) continue;
      const family = mask[start];
      mask[start] = 0;
      let count = 0,
        top = 0,
        minX = w,
        minY = h,
        maxX = 0,
        maxY = 0;
      stack[top++] = start;
      while (top) {
        const pos = stack[--top],
          x = pos % w,
          y = (pos / w) | 0;
        count++;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        for (const next of [
          x > 0 ? pos - 1 : -1,
          x + 1 < w ? pos + 1 : -1,
          y > 0 ? pos - w : -1,
          y + 1 < h ? pos + w : -1,
        ])
          if (next >= 0 && mask[next] === family) {
            mask[next] = 0;
            stack[top++] = next;
          }
      }
      if (minX === 0 || minY === 0 || maxX === w - 1 || maxY === h - 1)
        continue;
      const bw = maxX - minX + 1,
        bh = maxY - minY + 1,
        long = Math.max(bw, bh),
        short = Math.min(bw, bh),
        box = { x: x0 + minX, y: y0 + minY, w: bw, h: bh };
      if (
        long < 12 ||
        short < Math.max(4, lh * 0.35) ||
        short > lh * 2.8 ||
        count / (bw * bh) < 0.64 ||
        nearby(box, label) > 8
      )
        continue;
      // A component cut by the search window does not establish the complete track bounds.
      if (
        (minX === 0 && x0 > 0) ||
        (minY === 0 && y0 > 0) ||
        (maxX === w - 1 && x1 < image.width) ||
        (maxY === h - 1 && y1 < image.height)
      )
        continue;
      if (
        bw >= bh
          ? Math.abs(box.y + box.h / 2 - (label.y0 + label.y1) / 2) >
            Math.max(lh * 3, box.h * 2)
          : Math.abs(box.x + box.w / 2 - (label.x0 + label.x1) / 2) >
            Math.max(lh * 3, box.w * 2)
      )
        continue;
      found.push({
        ...box,
        family,
        labelAtStart:
          bw >= bh &&
          label.x0 <= box.x + box.w * 0.25 &&
          label.x1 >= box.x &&
          label.y0 < box.y + box.h &&
          label.y1 > box.y,
        kind: "bar",
        axis: bw >= bh ? "horizontal" : "vertical",
        track: "colored",
        inset: { left: 0, right: 0, top: 0, bottom: 0 },
        score:
          count / (bw * bh) -
          nearby(box, label) * 0.15 -
          ((bw >= bh
            ? Math.abs(box.y + box.h / 2 - (label.y0 + label.y1) / 2)
            : Math.abs(box.x + box.w / 2 - (label.x0 + label.x1) / 2)) /
            lh) *
            0.15,
      });
    }
    // Compression and colour gradients can split a single rectangular track into neighbouring hues.
    let changed = true;
    while (changed) {
      changed = false;
      outer: for (let i = 0; i < found.length; i++)
        for (let j = i + 1; j < found.length; j++) {
          const a = found[i],
            b = found[j],
            delta = Math.abs(a.family - b.family);
          if (Math.min(delta, 18 - delta) > 2) continue;
          const x = Math.min(a.x, b.x),
            y = Math.min(a.y, b.y),
            w = Math.max(a.x + a.w, b.x + b.w) - x,
            h = Math.max(a.y + a.h, b.y + b.h) - y;
          const horizontal =
            w / h >= 3.5 &&
            Math.abs(a.y + a.h / 2 - b.y - b.h / 2) <=
              Math.max(3, Math.max(a.h, b.h) * 0.2) &&
            Math.abs(a.h - b.h) <= Math.max(4, Math.max(a.h, b.h) * 0.35) &&
            Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w) <= 3;
          const vertical =
            h / w >= 3.5 &&
            Math.abs(a.x + a.w / 2 - b.x - b.w / 2) <=
              Math.max(3, Math.max(a.w, b.w) * 0.2) &&
            Math.abs(a.w - b.w) <= Math.max(4, Math.max(a.w, b.w) * 0.35) &&
            Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h) <= 3;
          if (!horizontal && !vertical) continue;
          found[i] = {
            ...a,
            x,
            y,
            w,
            h,
            axis: horizontal ? "horizontal" : "vertical",
            score: Math.max(a.score, b.score),
          };
          found.splice(j, 1);
          changed = true;
          break outer;
        }
    }
    return found.filter((b) => Math.max(b.w, b.h) / Math.min(b.w, b.h) >= 3.5);
  }
  function outlined(image, label) {
    const found = [],
      lh = Math.max(8, label.y1 - label.y0),
      radius = Math.max(90, lh * 4);
    for (const vertical of [false, true]) {
      const along = vertical ? image.height : image.width,
        cross = vertical ? image.width : image.height,
        labelA0 = vertical ? label.y0 : label.x0,
        labelA1 = vertical ? label.y1 : label.x1,
        labelB0 = vertical ? label.x0 : label.y0,
        labelB1 = vertical ? label.x1 : label.y1;
      const a0 = Math.max(0, Math.floor(labelA0 - radius)),
        a1 = Math.min(along, Math.ceil(labelA1 + along * 0.6)),
        b0 = Math.max(0, Math.floor(labelB0 - radius)),
        b1 = Math.min(cross, Math.ceil(labelB1 + radius)),
        runs = [];
      const at = (a, b) => pixel(image, vertical ? b : a, vertical ? a : b);
      for (let b = b0; b < b1; b++) {
        let start = -1;
        for (let a = a0; a <= a1; a++) {
          const yes = a < a1 && borderPixel(at(a, b));
          if (yes && start < 0) start = a;
          if (!yes && start >= 0) {
            if (a - start >= Math.max(35, lh * 2.5))
              runs.push({ a0: start, a1: a - 1, b });
            start = -1;
          }
        }
      }
      for (let i = 0; i < runs.length; i++)
        for (let j = i + 1; j < runs.length; j++) {
          const top = runs[i],
            bottom = runs[j],
            thickness = bottom.b - top.b + 1,
            length = top.a1 - top.a0 + 1;
          if (
            thickness < Math.max(6, lh * 0.35) ||
            thickness > lh * 2.8 ||
            length / thickness < 3.5 ||
            Math.abs(top.a0 - bottom.a0) > 3 ||
            Math.abs(top.a1 - bottom.a1) > 3
          )
            continue;
          const left = Math.min(top.a0, bottom.a0),
            right = Math.max(top.a1, bottom.a1);
          let caps = 0;
          for (let k = 0; k < 10; k++) {
            const b = top.b + ((bottom.b - top.b) * k) / 9;
            if (borderPixel(at(left, b))) caps++;
            if (borderPixel(at(right, b))) caps++;
          }
          if (caps < 17) continue;
          const box = vertical
            ? { x: top.b, y: left, w: thickness, h: right - left + 1 }
            : { x: left, y: top.b, w: right - left + 1, h: thickness };
          if (nearby(box, label) > 8) continue;
          if (
            vertical
              ? Math.abs(box.x + box.w / 2 - (label.x0 + label.x1) / 2) >
                Math.max(lh * 3, box.w * 2)
              : Math.abs(box.y + box.h / 2 - (label.y0 + label.y1) / 2) >
                Math.max(lh * 3, box.h * 2)
          )
            continue;
          const insets = { left: 1, right: 1, top: 1, bottom: 1 };
          // Estimate the outline thickness using lanes away from text in the centre.
          for (const side of ["left", "right", "top", "bottom"]) {
            for (
              let d = 1;
              d <= Math.min(5, Math.floor(Math.min(box.w, box.h) / 4));
              d++
            ) {
              let yes = 0;
              for (const f of [0.15, 0.3, 0.7, 0.85]) {
                const x =
                    side === "left"
                      ? box.x + d - 1
                      : side === "right"
                        ? box.x + box.w - d
                        : box.x + box.w * f,
                  y =
                    side === "top"
                      ? box.y + d - 1
                      : side === "bottom"
                        ? box.y + box.h - d
                        : box.y + box.h * f;
                if (borderPixel(pixel(image, x, y))) yes++;
              }
              if (yes >= 3) insets[side] = d;
              else break;
            }
          }
          found.push({
            ...box,
            kind: "bar",
            axis: vertical ? "vertical" : "horizontal",
            track: "outlined",
            inset: insets,
            score:
              1.25 -
              nearby(box, label) * 0.15 -
              ((vertical
                ? Math.abs(box.x + box.w / 2 - (label.x0 + label.x1) / 2)
                : Math.abs(box.y + box.h / 2 - (label.y0 + label.y1) / 2)) /
                lh) *
                0.15,
          });
        }
    }
    return found;
  }
  function profile(image, region) {
    const r = region,
      inset = r.inset || { left: 0, right: 0, top: 0, bottom: 0 },
      left = r.x + inset.left,
      top = r.y + inset.top,
      w = r.w - inset.left - inset.right,
      h = r.h - inset.top - inset.bottom;
    const horizontal = r.axis !== "vertical",
      length = Math.max(1, Math.round(horizontal ? w : h)),
      values = [],
      presence = [];
    for (let i = 0; i < length; i++) {
      const samples = [0.08, 0.14, 0.86, 0.92].map((f) =>
        pixel(
          image,
          horizontal ? left + ((i + 0.5) * w) / length : left + f * w,
          horizontal ? top + f * h : top + ((i + 0.5) * h) / length,
        ),
      );
      const relevant =
        r.track === "colored"
          ? samples.filter((rgb) => trackColor(rgb, r.family))
          : samples;
      const scores = (relevant.length ? relevant : samples)
        .map((rgb) => Math.max(...rgb))
        .sort((a, b) => a - b);
      values.push(
        r.track === "colored" && !relevant.length
          ? null
          : scores[Math.floor((scores.length - 1) / 2)],
      );
      presence.push(
        samples.filter((rgb) =>
          r.track === "colored" ? trackColor(rgb, r.family) : chromatic(rgb),
        ).length / 4,
      );
    }
    // White/black label strokes are excluded from colour measurements, then bridged only across small spatial gaps.
    for (let i = 0; i < values.length; ) {
      if (values[i] !== null) {
        i++;
        continue;
      }
      const start = i;
      while (i < values.length && values[i] === null) i++;
      const end = i,
        left = values[start - 1],
        right = values[end],
        length = end - start;
      if (
        left !== undefined &&
        right !== undefined &&
        ((Math.abs(left - right) <= 35 && length <= values.length * 0.12) ||
          length <= Math.max(2, values.length * 0.02))
      ) {
        for (let j = start; j < end; j++)
          values[j] = left + ((right - left) * (j - start + 1)) / (length + 1);
      } else if (length <= 2 && (left !== undefined || right !== undefined)) {
        for (let j = start; j < end; j++) values[j] = left ?? right;
      }
    }
    return { values, presence };
  }
  function normalized(box, image) {
    return {
      ...box,
      x: box.x / image.width,
      y: box.y / image.height,
      w: box.w / image.width,
      h: box.h / image.height,
      inset: {
        left: box.inset.left / box.w,
        right: box.inset.right / box.w,
        top: box.inset.top / box.h,
        bottom: box.inset.bottom / box.h,
      },
      profile: profile(image, box),
    };
  }
  function detect(image, labels) {
    const found = {};
    for (const { id, bbox } of labels) {
      const candidates = [
        ...outlined(image, bbox),
        ...colored(image, bbox),
      ].sort((a, b) => b.score - a.score);
      const best = candidates[0];
      if (!best) continue;
      // Different equally plausible tracks near the same label are deliberately left unresolved.
      const ambiguous = candidates.find(
        (c) =>
          Math.abs(c.score - best.score) < 0.04 &&
          Math.hypot(
            c.x + c.w / 2 - best.x - best.w / 2,
            c.y + c.h / 2 - best.y - best.h / 2,
          ) >
            Math.max(best.w, best.h) * 0.4,
      );
      if (!ambiguous && (!found[id] || best.score > found[id].score))
        found[id] = normalized(best, image);
    }
    return found;
  }
  function calibrate(samples) {
    if (!samples.length) return null;
    const base = samples[0],
      same = samples.filter(
        (r) =>
          r.axis === base.axis &&
          Math.abs(r.x - base.x) < Math.max(0.004, base.w * 0.04) &&
          Math.abs(r.y - base.y) < Math.max(0.004, base.h * 0.04) &&
          Math.abs(r.w - base.w) < Math.max(0.004, base.w * 0.04) &&
          Math.abs(r.h - base.h) < Math.max(0.004, base.h * 0.04),
      );
    if (same.length < 2 && !base.manual && base.track !== "outlined")
      return null;
    const histogram = new Uint32Array(256);
    for (const r of same)
      for (const n of r.profile.values)
        if (Number.isFinite(n)) histogram[clamp(Math.round(n), 0, 255)]++;
    if (!histogram.some((n) => n > 0)) return null;
    let low = 0,
      high = 255;
    while (low < 255 && !histogram[low]) low++;
    while (high > 0 && !histogram[high]) high--;
    let threshold = 110;
    if (high - low >= 40) {
      let a = low,
        b = high;
      for (let n = 0; n < 10; n++) {
        let sumA = 0,
          countA = 0,
          sumB = 0,
          countB = 0;
        for (let v = 0; v < 256; v++) {
          if (Math.abs(v - a) <= Math.abs(v - b)) {
            sumA += v * histogram[v];
            countA += histogram[v];
          } else {
            sumB += v * histogram[v];
            countB += histogram[v];
          }
        }
        if (countA) a = sumA / countA;
        if (countB) b = sumB / countB;
      }
      if (b - a >= 35) threshold = (a + b) / 2;
    } else if (high <= 75) threshold = 110;
    else if (low >= 145) threshold = 110;
    else return null;
    const darkTrack = same.some((r) => {
      const finite = r.profile.values.filter(Number.isFinite);
      if (
        finite.length >= r.profile.values.length * 0.7 &&
        Math.max(...finite) <= 75
      )
        return true;
      let run = [];
      const valid = () =>
        run.length >= r.profile.values.length * 0.12 &&
        Math.max(...run) - Math.min(...run) <= 15;
      for (const n of r.profile.values) {
        if (Number.isFinite(n) && n <= 75) run.push(n);
        else {
          if (valid()) return true;
          run = [];
        }
      }
      return valid();
    });
    const model = {
      ...base,
      threshold,
      boundsProven: !!base.manual || base.track === "outlined" || darkTrack,
      manual: !!base.manual,
      direction: base.direction || "auto",
      tone: base.tone || "bright",
      inset: base.inset || { left: 0, right: 0, top: 0, bottom: 0 },
    };
    delete model.profile;
    delete model.score;
    return model;
  }
  function read(image, model) {
    const inset = model.inset || { left: 0, right: 0, top: 0, bottom: 0 },
      box = {
        x: 0,
        y: 0,
        w: image.width,
        h: image.height,
        axis: model.axis,
        track: model.track,
        family: model.family,
        inset: {
          left: inset.left * image.width,
          right: inset.right * image.width,
          top: inset.top * image.height,
          bottom: inset.bottom * image.height,
        },
      };
    if (model.track === "outlined" && !model.manual) {
      let visible = 0;
      for (const f of [0.1, 0.3, 0.7, 0.9]) {
        if (borderPixel(pixel(image, f * (image.width - 1), 0))) visible++;
        if (borderPixel(pixel(image, f * (image.width - 1), image.height - 1)))
          visible++;
        if (borderPixel(pixel(image, 0, f * (image.height - 1)))) visible++;
        if (borderPixel(pixel(image, image.width - 1, f * (image.height - 1))))
          visible++;
      }
      if (visible < 12) return null;
    }
    const { values, presence } = profile(image, box);
    if (values.some((n) => n === null)) return null;
    if (
      model.track === "colored" &&
      !model.manual &&
      presence.filter((n) => n >= 0.5).length / values.length < 0.7
    )
      return null;
    if (model.tone !== "dark") {
      const quantile = (values, f) => {
        const sorted = [...values].sort((a, b) => a - b);
        return sorted[
          Math.min(sorted.length - 1, Math.floor(sorted.length * f))
        ];
      };
      if (
        model.labelAtStart &&
        model.axis === "horizontal" &&
        model.direction !== "right"
      ) {
        const tail = values.slice(
            -Math.max(3, Math.ceil(values.length * 0.03)),
          ),
          ramp = values.slice(
            Math.floor(values.length * 0.5),
            Math.floor(values.length * 0.95),
          );
        const bins = Array.from({ length: 10 }, (_, i) =>
          quantile(
            ramp.slice(
              Math.floor((i * ramp.length) / 10),
              Math.max(
                Math.floor((i * ramp.length) / 10) + 1,
                Math.floor(((i + 1) * ramp.length) / 10),
              ),
            ),
            0.5,
          ),
        );
        const range = quantile(ramp, 0.9) - quantile(ramp, 0.1);
        const distributed =
          bins.slice(1).filter((v, i) => v - bins[i] > Math.max(2, range / 30))
            .length >= 6;
        let rises = 0;
        for (let i = 3; i < ramp.length; i++)
          if (ramp[i] >= ramp[i - 3] - 5) rises++;
        if (
          quantile(tail, 0.5) >= 140 &&
          ramp.length > 10 &&
          quantile(ramp, 0.9) - quantile(ramp, 0.1) >= 35 &&
          rises / Math.max(1, ramp.length - 3) > 0.85 &&
          distributed
        )
          return 100;
      }
      let strongest = 0,
        boundary = -1;
      for (let i = 3; i < values.length - 3; i++) {
        const a = (values[i - 3] + values[i - 2] + values[i - 1]) / 3,
          b = (values[i] + values[i + 1] + values[i + 2]) / 3;
        if (Math.abs(a - b) > strongest) {
          strongest = Math.abs(a - b);
          boundary = i;
        }
      }
      if (strongest >= 28) {
        const a = values.slice(0, boundary),
          b = values.slice(boundary),
          leftBright = quantile(a, 0.9) >= Math.max(55, quantile(b, 0.9) + 20),
          rightBright = quantile(b, 0.9) >= Math.max(55, quantile(a, 0.9) + 20),
          leftEmpty = quantile(a, 0.9) <= 85,
          rightEmpty = quantile(b, 0.9) <= 85;
        if ((leftBright && rightEmpty) || (rightBright && leftEmpty)) {
          const reverse = rightBright && leftEmpty;
          if (
            model.direction !== "auto" &&
            reverse !==
              (model.direction === "right" || model.direction === "bottom")
          )
            return null;
          return (
            Math.round(
              ((reverse ? b.length : a.length) / values.length) * 1000,
            ) / 10
          );
        }
      }
      // A smooth luminous gradient is a filled segment; its dim end must not become an empty section.
      if (
        strongest < 30 &&
        quantile(values, 0.9) >= 145 &&
        quantile(values, 0.9) - quantile(values, 0.1) >= 35 &&
        presence.filter((n) => n >= 0.5).length / values.length > 0.8
      )
        return 100;
    }
    const filled = values.map((n) =>
        model.tone === "dark" ? n < model.threshold : n > model.threshold,
      ),
      n = filled.length;
    // Remove single-pixel compression speckles; it does not interpolate the signal over time.
    const clean = filled.map((v, i) =>
      i > 0 && i < n - 1 && filled[i - 1] === filled[i + 1] ? filled[i - 1] : v,
    );
    const count = clean.filter(Boolean).length;
    if (count <= 1) return 0;
    if (count >= n - 1) return 100;
    let first = clean.indexOf(true),
      last = clean.lastIndexOf(true);
    const fromStart = first <= Math.max(1, n * 0.015),
      fromEnd = last >= n - 1 - Math.max(1, n * 0.015);
    const reverse = model.direction === "right" || model.direction === "bottom";
    const fixed = model.direction !== "auto";
    if (
      (fixed && (reverse ? !fromEnd : !fromStart)) ||
      (!fromStart && !fromEnd) ||
      (fromStart && fromEnd)
    )
      return null;
    const span = fromStart ? last + 1 : n - first;
    if (Math.abs(span - count) > Math.max(3, n * 0.035)) return null;
    return Math.round(clamp((span / n) * 100, 0, 100) * 10) / 10;
  }
  function sample(image, region) {
    const i = region.inset || { left: 0, right: 0, top: 0, bottom: 0 };
    return {
      ...region,
      axis: region.axis || (region.w >= region.h ? "horizontal" : "vertical"),
      profile: profile(image, {
        x: region.x * image.width,
        y: region.y * image.height,
        w: region.w * image.width,
        h: region.h * image.height,
        axis: region.axis || (region.w >= region.h ? "horizontal" : "vertical"),
        track: region.track,
        family: region.family,
        inset: {
          left: i.left * region.w * image.width,
          right: i.right * region.w * image.width,
          top: i.top * region.h * image.height,
          bottom: i.bottom * region.h * image.height,
        },
      }),
    };
  }
  window.DriverBars = { detect, calibrate, read, sample };
})();
