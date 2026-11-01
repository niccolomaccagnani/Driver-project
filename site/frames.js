/* Native MP4/MOV frame decoding with original presentation timestamps and bounded queues. */
(() => {
  const aborted = (signal) => {
    if (signal?.aborted)
      throw new DOMException("Lettura interrotta", "AbortError");
  };
  async function open(file, { signal } = {}) {
    if (!window.VideoDecoder || !window.EncodedVideoChunk)
      throw Error(
        "Questo browser non offre la decodifica per fotogrammi. Usa Chrome/Safari aggiornato oppure scegli esplicitamente il campionamento compatibile.",
      );
    const mp4 = MP4Box.createFile(false);
    let info = null,
      error = null,
      offset = 0;
    mp4.onReady = (value) => {
      info = value;
    };
    mp4.onError = (message) => {
      error = Error("Contenitore MP4/MOV non leggibile: " + message);
    };
    while (offset < file.size && !info) {
      aborted(signal);
      const buffer = await file
        .slice(offset, Math.min(file.size, offset + 1024 * 1024))
        .arrayBuffer();
      buffer.fileStart = offset;
      const next = mp4.appendBuffer(buffer);
      if (error) throw error;
      offset =
        Number.isFinite(next) && next > offset
          ? next
          : offset + buffer.byteLength;
    }
    if (!info)
      throw Error(
        "Formato non supportato per la lettura originale. Sono supportati MP4/MOV non frammentati; per altri file usa il campionamento compatibile.",
      );
    if (info.isFragmented)
      throw Error(
        "Il video MP4 frammentato richiede il campionamento compatibile o una copia MP4 standard.",
      );
    const track = info.videoTracks[0];
    if (!track) throw Error("Nessuna traccia video nel file.");
    const samples = mp4.getTrackSamplesInfo(track.id);
    if (!samples?.length)
      throw Error("La traccia video non contiene fotogrammi.");
    const edits = track.edits || [],
      mediaEdits = edits.filter((e) => e.media_time >= 0);
    if (
      mediaEdits.length > 1 ||
      edits.some(
        (e) => e.media_rate_integer !== 1 || e.media_rate_fraction !== 0,
      )
    )
      throw Error(
        "Montaggio con più segmenti non supportato: usa il campionamento compatibile.",
      );
    const edit = mediaEdits[0],
      mediaStart = edit ? edit.media_time / track.timescale : 0;
    let delay = 0;
    for (const e of edits) {
      if (e.media_time >= 0) break;
      delay += e.segment_duration / info.timescale;
    }
    const end = edit
      ? delay + edit.segment_duration / info.timescale
      : Infinity;
    const ordered = samples
      .map((s, i) => ({
        sample: s,
        decodeIndex: i,
        time: s.cts / s.timescale - mediaStart + delay,
        duration: s.duration / s.timescale,
        stamp: Math.round((s.cts / s.timescale) * 1e6),
      }))
      .filter((s) => s.time >= delay - 0.000001 && s.time < end - 0.000001)
      .sort((a, b) => a.stamp - b.stamp || a.decodeIndex - b.decodeIndex);
    if (!ordered.length)
      throw Error("Nessun fotogramma nella timeline del video.");
    ordered.forEach((s, i) => {
      s.index = i;
      s.time = Math.max(0, s.time);
      s.duration = Math.max(
        0.000001,
        (ordered[i + 1]?.time ?? Math.min(end, s.time + s.duration)) - s.time,
      );
    });
    const entry = mp4.getTrackById(track.id).mdia.minf.stbl.stsd.entries[0],
      box = entry.avcC || entry.hvcC || entry.vpcC || entry.av1C;
    let description;
    if (box) {
      const stream = new DataStream(undefined, 0, DataStream.BIG_ENDIAN);
      box.write(stream);
      description = new Uint8Array(stream.buffer, 8);
    }
    let codec = track.codec;
    if (codec.startsWith("vp08")) codec = "vp8";
    const config = {
      codec,
      codedWidth: track.video.width,
      codedHeight: track.video.height,
      ...(description ? { description } : {}),
      optimizeForLatency: false,
    };
    let supported;
    try {
      supported = await VideoDecoder.isConfigSupported(config);
    } catch {}
    if (!supported?.supported)
      throw Error(
        `Codec ${codec} non disponibile per la lettura originale in questo browser. Usa un browser compatibile o scegli il campionamento compatibile.`,
      );
    const matrix = track.matrix || [],
      rotation = matrix.length
        ? (((Math.round(
            (Math.atan2(matrix[1], matrix[0]) * 180) / Math.PI / 90,
          ) *
            90) %
            360) +
            360) %
          360
        : 0;
    const duration = ordered.reduce(
        (max, s) => Math.max(max, s.time + s.duration),
        0,
      ),
      byStamp = new Map();
    for (const s of ordered) {
      if (!byStamp.has(s.stamp)) byStamp.set(s.stamp, []);
      byStamp.get(s.stamp).push(s);
    }
    let cache = null,
      cacheStart = 0;
    async function bytes(sample) {
      if (
        !cache ||
        sample.offset < cacheStart ||
        sample.offset + sample.size > cacheStart + cache.byteLength
      ) {
        cacheStart = sample.offset;
        cache = await file
          .slice(
            cacheStart,
            Math.min(
              file.size,
              cacheStart + Math.max(2 * 1024 * 1024, sample.size),
            ),
          )
          .arrayBuffer();
      }
      if (sample.offset + sample.size > cacheStart + cache.byteLength)
        throw Error("Dati del fotogramma incompleti.");
      return new Uint8Array(cache, sample.offset - cacheStart, sample.size);
    }
    const missingFrames = new Set();
    async function* frames({
      signal,
      start = 0,
      end: finish = ordered.length - 1,
    } = {}) {
      aborted(signal);
      const targetStart = ordered[start];
      if (!targetStart) throw Error("Fotogramma inesistente.");
      let first = targetStart.decodeIndex;
      while (first > 0 && !samples[first].is_sync) first--;
      const targetEnd = ordered[Math.min(finish, ordered.length - 1)];
      let last = targetEnd.decodeIndex;
      while (last + 1 < samples.length && !samples[last + 1].is_sync) last++;
      // Decode through the next sync point as well so open-GOP references can be resolved.
      if (last + 1 < samples.length) last++;
      const queue = [],
        positions = new Map();
      let decoderError = null,
        done = false,
        stopped = false;
      let wake = null;
      const notify = () => {
        wake?.();
        wake = null;
      };
      const wait = () =>
        new Promise((resolve) => {
          wake = resolve;
        });
      const decoder = new VideoDecoder({
        output(frame) {
          if (stopped) {
            frame.close();
            return;
          }
          const candidates = byStamp.get(frame.timestamp),
            used = positions.get(frame.timestamp) || 0,
            meta = candidates?.[used];
          positions.set(frame.timestamp, used + 1);
          if (!meta || meta.index < start || meta.index > finish) {
            frame.close();
            notify();
            return;
          }
          queue.push({ frame, ...meta });
          notify();
        },
        error(error) {
          decoderError = error;
          done = true;
          notify();
        },
      });
      const stop = () => {
        stopped = true;
        try {
          decoder.close();
        } catch {}
        notify();
      };
      signal?.addEventListener("abort", stop, { once: true });
      try {
        decoder.configure(config);
      } catch (error) {
        signal?.removeEventListener("abort", stop);
        stop();
        throw error;
      }
      const producer = (async () => {
        try {
          for (let i = first; i <= last; i++) {
            aborted(signal);
            if (stopped) break;
            while (
              !stopped &&
              (queue.length >= 3 || decoder.decodeQueueSize >= 4)
            )
              await new Promise((resolve) => setTimeout(resolve, 2));
            if (stopped) break;
            const sample = samples[i],
              data = await bytes(sample);
            aborted(signal);
            decoder.decode(
              new EncodedVideoChunk({
                type: sample.is_sync ? "key" : "delta",
                timestamp: Math.round((sample.cts / sample.timescale) * 1e6),
                duration: Math.round(
                  (sample.duration / sample.timescale) * 1e6,
                ),
                data,
              }),
            );
          }
          if (!stopped && !decoderError) await decoder.flush();
        } catch (error) {
          decoderError = error;
        } finally {
          done = true;
          notify();
        }
      })();
      let emitted = 0,
        nextIndex = start;
      function unavailable(index) {
        missingFrames.add(index);
        return { ...ordered[index], frame: null, unavailable: true };
      }
      try {
        while (!done || queue.length) {
          aborted(signal);
          if (decoderError) throw decoderError;
          if (!queue.length) {
            await wait();
            continue;
          }
          const item = queue.shift();
          let delivered = false;
          try {
            while (nextIndex < item.index) {
              aborted(signal);
              const missing = unavailable(nextIndex++);
              emitted++;
              yield missing;
            }
            if (item.index !== nextIndex)
              throw Error("Ordine dei fotogrammi incoerente.");
            nextIndex++;
            emitted++;
            delivered = true;
            yield item;
          } finally {
            if (!delivered) item.frame.close();
          }
        }
        if (decoderError) throw decoderError;
        while (nextIndex <= Math.min(finish, ordered.length - 1)) {
          const missing = unavailable(nextIndex++);
          emitted++;
          yield missing;
        }
        if (emitted !== Math.min(finish, ordered.length - 1) - start + 1)
          throw Error(
            `Decodifica incompleta: ${emitted} fotogrammi letti. Il set non è stato salvato.`,
          );
      } finally {
        stop();
        signal?.removeEventListener("abort", stop);
        queue.forEach((item) => item.frame.close());
        await producer;
      }
    }
    function draw(canvas, frame) {
      const w = frame.displayWidth,
        h = frame.displayHeight;
      canvas.width = rotation % 180 ? h : w;
      canvas.height = rotation % 180 ? w : h;
      const context = canvas.getContext("2d");
      context.save();
      context.translate(canvas.width / 2, canvas.height / 2);
      context.rotate((rotation * Math.PI) / 180);
      context.drawImage(frame, -w / 2, -h / 2, w, h);
      context.restore();
    }
    async function frameAt(index, { signal } = {}) {
      for await (const item of frames({ signal, start: index, end: index })) {
        if (!item.frame)
          throw Error(
            "Il decoder non restituisce questo fotogramma: i valori sono stati lasciati vuoti al suo timestamp originale.",
          );
        return item;
      }
      throw Error("Fotogramma non decodificato.");
    }
    return {
      frames,
      frameAt,
      draw,
      count: ordered.length,
      duration,
      rotation,
      codec,
      times: ordered.map((s) => s.time),
      fps: ordered.length / duration,
      missingFrames,
      variable: ordered.some(
        (s, i) =>
          i > 1 &&
          Math.abs(
            s.time - ordered[i - 1].time - (ordered[1].time - ordered[0].time),
          ) > 0.0001,
      ),
    };
  }
  window.DriverFrames = { open };
})();
