(() => {
  const cache = new Map(),
    pending = new Map();
  let activeDownload;
  async function loadLocal(id, signal) {
    if (window.EMBEDDED?.[id] || !window.EMBEDDED_INDEX?.[id]) return;
    if (!pending.has(id))
      pending.set(
        id,
        new Promise((resolve, reject) => {
          const script = document.createElement("script");
          script.src = window.EMBEDDED_INDEX[id];
          let settled = false;
          const finish = (error) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            signal.removeEventListener("abort", onAbort);
            script.onload = script.onerror = null;
            script.remove();
            if (error) {
              pending.delete(id);
              reject(error);
            } else resolve();
          };
          const onAbort = () =>
            finish(Object.assign(Error("Download cancelled."), { name: "AbortError" }));
          const timeout = setTimeout(
            () =>
              finish(
                Error(
                  "Crystal data loading timed out. Retry loading or choose another Local example.",
                ),
              ),
            30000,
          );
          signal.addEventListener("abort", onAbort, { once: true });
          script.onload = () =>
            finish(
              window.EMBEDDED?.[id]
                ? null
                : Error(
                    "The bundled crystal example contains no crystal data. Choose another Local example.",
                  ),
            );
          script.onerror = () =>
            finish(
              Error(
                "The bundled crystal example could not be loaded. Retry loading or check that the complete Lab folder is present.",
              ),
            );
          document.head.append(script);
        }),
      );
    await pending.get(id);
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
        try {
          const start = entry.start + offset,
            end = start + length - 1;
          const response = await fetch(url, {
            headers: { Range: `bytes=${start}-${end}` },
            signal: AbortSignal.any([signal, AbortSignal.timeout(90000)]),
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
    async load(id, onProgress) {
      activeDownload?.abort();
      const download = new AbortController();
      activeDownload = download;
      await loadLocal(id, download.signal);
      download.signal.throwIfAborted();
      const key = (window.EMBEDDED?.[id] || window.EMBEDDED_INDEX?.[id] ? "local:" : "cloud:") + id;
      if (cache.has(key)) return cache.get(key);
      let blob;
      if (window.EMBEDDED?.[id]) {
        const bytes = Uint8Array.from(atob(window.EMBEDDED[id]), (c) => c.charCodeAt(0));
        blob = new Blob([bytes]);
      } else {
        blob = await downloadArchive(
          window.LAB_CONFIG?.data,
          window.ARCHIVE_INDEX?.[id],
          download.signal,
          onProgress,
        );
      }
      download.signal.throwIfAborted();
      const data = await decode(blob);
      download.signal.throwIfAborted();
      cache.set(key, data);
      while (cache.size > 2) cache.delete(cache.keys().next().value);
      return data;
    },
  };
})();
