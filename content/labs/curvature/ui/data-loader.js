(() => {
  const cache = new Map();
  let activeDownload;
  async function loadLocal(id, signal) {
    let encoded = window.EMBEDDED?.[id];
    if (!encoded) {
      const blob = await window.LabData.request(window.EMBEDDED_INDEX[id], { signal });
      const text = await blob.text();
      const match = text.match(/window\.EMBEDDED\["([^"]+)"\]\s*=\s*"([A-Za-z0-9+/=]+)"/);
      if (!match || match[1] !== id)
        throw Error("The Local crystal response was not usable. Please retry.");
      encoded = match[2];
    }
    return new Blob([Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0))]);
  }
  async function decode(blob) {
    if (!globalThis.DecompressionStream)
      throw Error(
        "This browser does not support gzip decompression. Use a current Chrome, Edge or Firefox.",
      );
    if (blob.size > 32 * 1024 * 1024)
      throw Error("Crystal data exceeds the browser size limit. Choose a Local example.");
    const reader = blob.stream().pipeThrough(new DecompressionStream("gzip")).getReader(),
      chunks = [];
    let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > 128 * 1024 * 1024) {
          await reader.cancel();
          throw Error(
            "Expanded crystal data exceeds the browser size limit. Choose a Local example.",
          );
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    let data;
    try {
      data = JSON.parse(await new Blob(chunks).text());
    } catch (e) {
      throw Error("Crystal data could not be decoded. Retry or choose a Local example.");
    }
    for (const name of ["single", "agglomerate", "broken"]) {
      const mesh = data?.[name];
      if (!mesh) continue;
      if (
        !Array.isArray(mesh.vertices) ||
        !Array.isArray(mesh.faces) ||
        mesh.vertices.length < 4 ||
        mesh.vertices.length > 1000000 ||
        !mesh.faces.length ||
        mesh.faces.length > 2000000 ||
        !Number.isFinite(mesh.volume) ||
        mesh.volume <= 0
      )
        throw Error(
          "Crystal geometry is invalid or exceeds the browser mesh limit. Choose another crystal.",
        );
      if (
        mesh.vertices.some(
          (v) => !Array.isArray(v) || v.length !== 3 || v.some((x) => !Number.isFinite(x)),
        ) ||
        mesh.faces.some(
          (f) =>
            !Array.isArray(f) ||
            f.length !== 3 ||
            f.some((i) => !Number.isInteger(i) || i < 0 || i >= mesh.vertices.length),
        )
      )
        throw Error(
          "Crystal geometry contains invalid coordinates or face indices. Choose another crystal.",
        );
    }
    if (!data?.single) throw Error("Crystal data is missing its single-crystal geometry.");
    return data;
  }
  async function downloadArchive(cfg, entry, signal, onProgress) {
    if (!cfg?.remoteEnabled || !cfg.recordURL || !entry)
      throw Error("This crystal is unavailable. Choose a Local example from Crystal library.");
    if (
      !Number.isSafeInteger(entry.start) ||
      entry.start < 0 ||
      !Number.isSafeInteger(entry.length) ||
      entry.length < 1 ||
      entry.length > 32 * 1024 * 1024
    )
      throw Error("The dataset entry exceeds the browser download limit. Choose a Local example.");
    const url =
      (cfg.fileBaseURL ||
        cfg.recordURL.replace("/records/", "/api/records/").replace(/\/$/, "") + "/files/") +
      encodeURIComponent(entry.archive) +
      "/content";
    // Fetch bounded ranges so a slow connection can retry one part rather
    // than discard the complete crystal. Never accept a full archive response.
    const chunks = [],
      partSize = 2 * 1024 * 1024;
    for (let offset = 0; offset < entry.length; offset += partSize) {
      const length = Math.min(partSize, entry.length - offset);
      let part;
      for (let attempt = 0; attempt < 2; attempt++) {
        const request = window.LabData.deadline(signal, 90000);
        try {
          const start = entry.start + offset,
            end = start + length - 1;
          const response = await fetch(url, {
            headers: { Range: `bytes=${start}-${end}` },
            signal: request.signal,
          });
          if (response.status !== 206) {
            await response.body?.cancel();
            throw Error(
              "Zenodo does not currently support this partial download. Choose a Local example.",
            );
          }
          const range = response.headers.get("Content-Range");
          if (range && !range.startsWith(`bytes ${start}-${end}/`)) {
            await response.body?.cancel();
            throw Error("Zenodo returned an unexpected data range. Please retry later.");
          }
          const reader = response.body.getReader(),
            values = [];
          let received = 0;
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              received += value.byteLength;
              if (received > length) {
                await reader.cancel();
                throw Error("The server returned more data than requested.");
              }
              values.push(value);
              onProgress?.((offset + received) / entry.length);
            }
          } finally {
            reader.releaseLock();
          }
          if (received !== length) throw Error("The downloaded crystal data is incomplete.");
          part = new Blob(values);
          break;
        } catch (error) {
          if (signal.aborted) throw error;
          if (attempt === 1)
            throw Error(
              `Cloud download failed at ${Math.round((offset / entry.length) * 100)}%. Retry, or choose a Local example. ${error.name === "TimeoutError" ? "Zenodo timed out." : error.message}`,
            );
        } finally {
          request.dispose();
        }
      }
      chunks.push(part);
    }
    return new Blob(chunks);
  }
  window.CrystalData = {
    cancel() {
      activeDownload?.abort();
    },
    async load(id, onProgress, onSource = () => {}) {
      activeDownload?.abort();
      const download = new AbortController();
      activeDownload = download;
      if (cache.has(id)) {
        const saved = cache.get(id);
        onSource(saved.source);
        return saved.value;
      }
      const cfg = window.LAB_CONFIG?.data,
        entry = window.ARCHIVE_INDEX?.[id];
      const local = window.EMBEDDED?.[id] || window.EMBEDDED_INDEX?.[id];
      const result = await window.LabData.load({
        local: local ? async () => decode(await loadLocal(id, download.signal)) : null,
        cloud:
          cfg?.remoteEnabled && cfg.recordURL && entry
            ? async () => decode(await downloadArchive(cfg, entry, download.signal, onProgress))
            : null,
        signal: download.signal,
        onSource,
      });
      cache.set(id, result);
      while (cache.size > 2) cache.delete(cache.keys().next().value);
      return result.value;
    },
  };
})();
